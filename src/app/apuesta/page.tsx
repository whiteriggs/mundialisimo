"use client";

import NavBar from "@/components/NavBar";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDoc, setDoc, getDocs } from "firebase/firestore";
import { groupDoc, groupCollection } from "@/lib/db";
import { getStoredUser, clearUser, getUsers } from "@/lib/auth";
import Flag from "@/components/Flag";
import { TEAMS as teams, GROUP_POOL as groupPool, teamName } from "@/lib/teams";

const favoriteBounds = { min: 9, max: 12 };
const antiBounds = { min: 4, max: 6 };
const ticketBounds = { min: 15, max: 22 };
const DEADLINE = new Date("2026-06-11T00:00:00");

type BetDoc = {
  user: string;
  favorites: string[];
  antiFavorites: string[];
  superFavorite?: string | null;
  confirmed: boolean;
};

function betCost(favorites: string[], antiFavorites: string[]) {
  const price = (id: string) => teams.find((t) => t.id === id)?.price ?? 0;
  return favorites.reduce((s, id) => s + price(id), 0) -
    antiFavorites.reduce((s, id) => s + price(id), 0);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function hasDuplicateGroup(ids: string[]) {
  const groups = ids
    .map((id) => teams.find((t) => t.id === id)?.group)
    .filter(Boolean) as string[];
  return new Set(groups).size !== groups.length;
}

export default function ApuestaPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [antiFavorites, setAntiFavorites] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [superFavorite, setSuperFavorite] = useState<string | null>(null);
  const [tab, setTab] = useState<"mia" | "todas">("mia");
  const [allBets, setAllBets] = useState<BetDoc[]>([]);
  const [allUsers, setAllUsers] = useState<string[]>([]);

  const groupLabels = Object.keys(groupPool);
  const isClosed = new Date() >= DEADLINE;

  async function loadAllBets() {
    try {
      const [snap, users] = await Promise.all([
        getDocs(groupCollection("bets")),
        getUsers(),
      ]);
      const data: BetDoc[] = snap.docs.map((d) => {
        const raw = d.data() as Partial<Omit<BetDoc, "user">>;
        return {
          user: d.id,
          favorites: raw.favorites ?? [],
          antiFavorites: raw.antiFavorites ?? [],
          superFavorite: raw.superFavorite ?? null,
          confirmed: raw.confirmed ?? false,
        };
      });
      data.sort((a, b) => {
        if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
        return a.user.localeCompare(b.user, "es");
      });
      setAllBets(data);
      setAllUsers(users.map((u) => u.toLowerCase()));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const storedUser = getStoredUser();
    if (!storedUser) {
      router.push("/login");
      return;
    }
    setUser(storedUser);

    async function loadBet() {
      try {
        const docRef = groupDoc("bets", storedUser!.toLowerCase());
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setFavorites(data.favorites ?? []);
          setAntiFavorites(data.antiFavorites ?? []);
          setSuperFavorite(data.superFavorite ?? null);
          setConfirmed(data.confirmed ?? false);
        }
      } catch {
        // Firestore error: continue with empty state
      } finally {
        setLoading(false);
      }
    }

    loadBet();
    loadAllBets();
  }, [router]);

  // Auto-clear superFavorite if team removed from favorites
  useEffect(() => {
    if (superFavorite && !favorites.includes(superFavorite)) {
      setSuperFavorite(null);
    }
  }, [favorites, superFavorite]);

  const favoritesCost = useMemo(
    () => favorites.reduce((sum, id) => sum + (teams.find((t) => t.id === id)?.price ?? 0), 0),
    [favorites]
  );

  const antiDiscount = useMemo(
    () => antiFavorites.reduce((sum, id) => sum + (teams.find((t) => t.id === id)?.price ?? 0), 0),
    [antiFavorites]
  );

  const ticketCost = favoritesCost - antiDiscount;
  const overlap = favorites.some((id) => antiFavorites.includes(id));

  const validations = [
    {
      ok: favorites.length >= favoriteBounds.min && favorites.length <= favoriteBounds.max,
      text: `Favoritos: ${favoriteBounds.min}-${favoriteBounds.max} (actual ${favorites.length})`
    },
    {
      ok: antiFavorites.length >= antiBounds.min && antiFavorites.length <= antiBounds.max,
      text: `Antifavoritos: ${antiBounds.min}-${antiBounds.max} (actual ${antiFavorites.length})`
    },
    { ok: !hasDuplicateGroup(favorites), text: "No repetir grupo en favoritos" },
    { ok: !hasDuplicateGroup(antiFavorites), text: "No repetir grupo en antifavoritos" },
    { ok: !overlap, text: "Un equipo no puede estar en ambos bloques" },
    {
      ok: ticketCost >= ticketBounds.min && ticketCost <= ticketBounds.max,
      text: `Coste entre ${ticketBounds.min} y ${ticketBounds.max} pts (actual ${ticketCost} pts)`
    },
    { ok: superFavorite !== null, text: "Marca un favorito como campeón (★)" }
  ];

  const allValid = validations.every((r) => r.ok);

  function toggleTeam(teamId: string, isFavorite: boolean) {
    if (isFavorite) {
      setFavorites((c) => c.includes(teamId) ? c.filter((id) => id !== teamId) : [...c, teamId]);
    } else {
      setAntiFavorites((c) => c.includes(teamId) ? c.filter((id) => id !== teamId) : [...c, teamId]);
    }
  }

  function getGroupTeams(group: string) {
    return groupPool[group as keyof typeof groupPool] || [];
  }

  function hasGroupInFavorites(group: string) {
    return favorites.some((id) => teams.find((t) => t.id === id)?.group === group);
  }

  function hasGroupInAntifavorites(group: string) {
    return antiFavorites.some((id) => teams.find((t) => t.id === id)?.group === group);
  }

  async function handleConfirm() {
    if (!user || !allValid) return;
    setSaving(true);
    try {
      await setDoc(groupDoc("bets", user.toLowerCase()), {
        favorites,
        antiFavorites,
        superFavorite: superFavorite ?? null,
        confirmed: true,
        updatedAt: new Date()
      });
      setConfirmed(true);
      loadAllBets();
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!user || isClosed) return;
    setSaving(true);
    try {
      await setDoc(groupDoc("bets", user.toLowerCase()), {
        favorites,
        antiFavorites,
        superFavorite: superFavorite ?? null,
        confirmed: false,
        updatedAt: new Date()
      });
      setConfirmed(false);
      loadAllBets();
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    clearUser();
    router.push("/login");
  }

  if (loading) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div className="brand"><span className="dot" /><h1>Mundialisimo</h1></div>
        </header>
        <div className="loading-screen"><p className="muted">Cargando tu apuesta…</p></div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialisimo</h1>
          <span className="sub">{user}</span>
        </div>
        <NavBar user={user} />
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">⚽</div>
          <div className="hero-text">
            <div className="hero-eyebrow">{tab === "mia" ? "Tu apuesta" : "Porra Mundial 2026"}</div>
            <h2 className="hero-name">{tab === "mia" ? `Hola, ${user}` : "Apuestas de todos"}</h2>
            <p className="lead">
              {tab === "todas"
                ? "Solo se muestran apuestas confirmadas."
                : isClosed
                ? confirmed
                  ? "Tu apuesta está confirmada. Las apuestas están cerradas."
                  : "Las apuestas están cerradas desde el inicio del Mundial."
                : confirmed
                  ? "Tu apuesta está confirmada. Puedes editarla hasta el inicio del Mundial."
                  : "Elige tus favoritos y antifavoritos y confirma tu apuesta."}
            </p>
          </div>
        </div>
      </section>

      {/* Selector de pestañas */}
      <div className="results-section">
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "mia"}
            className={`tab ${tab === "mia" ? "tab-active" : ""}`}
            onClick={() => setTab("mia")}
          >
            Mi apuesta
          </button>
          <button
            role="tab"
            aria-selected={tab === "todas"}
            className={`tab ${tab === "todas" ? "tab-active" : ""}`}
            onClick={() => { setTab("todas"); loadAllBets(); }}
          >
            Todas las apuestas
          </button>
        </div>
      </div>

      {tab === "mia" && (
      <>
      {confirmed && !isClosed && (ticketCost < ticketBounds.min || ticketCost > ticketBounds.max) && (
        <div className="deadline-notice ko" style={{ margin: "0 1rem 0" }}>
          El orden de los grupos ha cambiado y tu apuesta ya no es válida ({ticketCost} pts, rango {ticketBounds.min}–{ticketBounds.max}). Pulsa &quot;Editar apuesta&quot; para ajustarla.
        </div>
      )}

      <div className={`price-bar ${confirmed && (ticketCost < ticketBounds.min || ticketCost > ticketBounds.max) ? "price-over" : confirmed ? "price-confirmed" : ticketCost > ticketBounds.max ? "price-over" : ticketCost < ticketBounds.min && (favorites.length > 0 || antiFavorites.length > 0) ? "price-under" : ticketCost >= ticketBounds.min && ticketCost <= ticketBounds.max ? "price-ok" : ""}`}>
        <div className="price-bar-inner">
          <span className="price-bar-total">
            <span className="price-bar-label">{confirmed ? "Apuesta confirmada" : "Apuesta"}</span>
            <span className="price-bar-amount">{ticketCost} pts</span>
          </span>
          {!confirmed && <span className="price-bar-range">rango válido: {ticketBounds.min}-{ticketBounds.max} pts</span>}
          {confirmed && !isClosed && (
            <button className="btn edit-btn" onClick={handleEdit} disabled={saving}>
              {saving ? "Guardando…" : "Editar apuesta"}
            </button>
          )}
          {isClosed && confirmed && (
            <span className="price-bar-range closed-label">Apuestas cerradas · Mundial en marcha</span>
          )}
        </div>
      </div>

      <div className="bet-builder">
        <section className="bet-section">
          <div className="section-header">
            <h2>Selecciona tus equipos</h2>
            <div className="counters">
              <span className="counter fav-counter">
                <span className="dot-fav" /> Favoritos {favorites.length}/9-12
              </span>
              <span className="counter anti-counter">
                <span className="dot-anti" /> Antifavoritos {antiFavorites.length}/4-6
              </span>
            </div>
          </div>
          {!confirmed && <p className="muted">Botones verdes para favoritos, rojos para antifavoritos. Máximo 1 equipo por grupo en cada bloque.</p>}

          <div className="groups-grid">
            {groupLabels.map((group) => (
              <div className="group-card" key={`group-${group}`}>
                <h3 className="group-label">Grupo {group}</h3>
                <div className="group-teams">
                  {getGroupTeams(group).map((name, idx) => {
                    const teamId = name;
                    const isFav = favorites.includes(teamId);
                    const isAnti = antiFavorites.includes(teamId);
                    const team = teams.find((t) => t.id === teamId);

                    if (confirmed) {
                      return (
                        <div
                          className={`team-result ${isFav ? "team-result-fav" : isAnti ? "team-result-anti" : "team-result-neutral"}${superFavorite === teamId ? " team-result-super" : ""}`}
                          key={teamId}
                        >
                          <span className="team-name">
                            {superFavorite === teamId && <span className="super-star">★</span>}
                            <Flag name={name} />{name}
                          </span>
                          <span className="team-result-badge">
                            {isFav ? `+${team?.price} pts` : isAnti ? `-${team?.price} pts` : `${team?.price} pts`}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div className="team-dual" key={teamId}>
                        <div className="team-info">
                          <span className="team-name"><Flag name={name} />{name}</span>
                          <span className="team-price">{team?.price || 0} pts</span>
                        </div>
                        <div className="team-controls">
                          {isFav && (
                            <button
                              type="button"
                              className={`star-btn${superFavorite === teamId ? " star-btn--active" : ""}`}
                              onClick={() => setSuperFavorite(superFavorite === teamId ? null : teamId)}
                              title={superFavorite === teamId ? "Quitar superfavorito" : "Marcar como campeón (desempate)"}
                            >
                              {superFavorite === teamId ? "★" : "☆"}
                            </button>
                          )}
                          <button
                            className={`team-btn fav-btn ${isFav ? "active" : ""} ${!isFav && (favorites.length >= 12 || hasGroupInFavorites(group) || isAnti) ? "disabled" : ""}`}
                            onClick={() => toggleTeam(teamId, true)}
                            disabled={!isFav && (favorites.length >= 12 || hasGroupInFavorites(group) || isAnti)}
                            title={isFav ? "Remover de favoritos" : isAnti ? "Ya es antifavorito" : hasGroupInFavorites(group) ? "Ya hay un equipo de este grupo" : "Marcar como favorito"}
                          />
                          <button
                            className={`team-btn anti-btn ${isAnti ? "active" : ""} ${!isAnti && (antiFavorites.length >= 6 || hasGroupInAntifavorites(group) || isFav) ? "disabled" : ""}`}
                            onClick={() => toggleTeam(teamId, false)}
                            disabled={!isAnti && (antiFavorites.length >= 6 || hasGroupInAntifavorites(group) || isFav)}
                            title={isAnti ? "Remover de antifavoritos" : isFav ? "Ya es favorito" : hasGroupInAntifavorites(group) ? "Ya hay un equipo de este grupo" : "Marcar como antifavorito"}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {!confirmed && !isClosed && (
            <div className="bet-actions">
              <button
                className={`btn confirm-btn ${allValid ? "" : "confirm-btn-disabled"}`}
                disabled={!allValid || saving}
                onClick={handleConfirm}
              >
                {saving ? "Guardando…" : allValid ? "Confirmar apuesta" : "Completa la apuesta para confirmar"}
              </button>
            </div>
          )}
          {isClosed && !confirmed && (
            <p className="deadline-notice ko">Las apuestas están cerradas desde el inicio del Mundial (11 jun 2026).</p>
          )}
        </section>
      </div>

      <div className="grid">
        <article className="card highlight summary-card">
          <h2>Resumen</h2>
          <p>Coste favoritos: {favoritesCost} pts</p>
          <p>Abono antifavoritos: {antiDiscount} pts</p>
          <p><strong>Coste final: {ticketCost} pts</strong></p>
          <h3>Validaciones</h3>
          <ul className="checks">
            {validations.map((rule) => (
              <li className={rule.ok ? "ok" : "ko"} key={rule.text}>
                {rule.ok ? "✓" : "✗"} {rule.text}
              </li>
            ))}
          </ul>
          <p className={allValid ? "ok" : "ko"}>
            {allValid ? "Apuesta válida." : "Aún no cumple todas las reglas."}
          </p>
        </article>
      </div>
      </>
      )}

      {tab === "todas" && (
        <div className="bets-grid">
          {allUsers.map((uid) => {
            const bet = allBets.find((b) => b.user === uid);
            const displayName = cap(uid);
            const isMe = user?.toLowerCase() === uid;

            if (!bet || !bet.confirmed) {
              return (
                <div className="bet-card bet-card--pending" key={uid}>
                  <div className="bet-card-header">
                    <span className="bet-card-name">{displayName}{isMe ? " (tú)" : ""}</span>
                    <span className="status-badge status-pending">Sin confirmar</span>
                  </div>
                  <p className="muted" style={{ margin: "12px 0 0" }}>Apuesta no confirmada todavía.</p>
                </div>
              );
            }

            const cost = betCost(bet.favorites, bet.antiFavorites);

            return (
              <div className="bet-card" key={uid}>
                <div className="bet-card-header">
                  <span className="bet-card-name">{displayName}{isMe ? " (tú)" : ""}</span>
                  <span className="status-badge status-confirmed">Confirmada · {cost} pts</span>
                </div>

                <div className="bet-card-section">
                  <h4 className="bet-card-label">Favoritos ({bet.favorites.length})</h4>
                  <ul className="bet-team-list fav-list">
                    {bet.favorites.map((id) => {
                      const team = teams.find((t) => t.id === id);
                      const isSuper = bet.superFavorite === id;
                      return (
                        <li key={id} className={isSuper ? "bet-team-super" : ""}>
                          {isSuper && <span className="super-star">★</span>}
                          <span className="bet-team-name"><Flag name={teamName(id)} />{teamName(id)}</span>
                          <span className="bet-team-group">Gr. {team?.group}</span>
                          <span className="bet-team-price">+{team?.price} pts</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="bet-card-section">
                  <h4 className="bet-card-label">Antifavoritos ({bet.antiFavorites.length})</h4>
                  <ul className="bet-team-list anti-list">
                    {bet.antiFavorites.map((id) => {
                      const team = teams.find((t) => t.id === id);
                      return (
                        <li key={id}>
                          <span className="bet-team-name"><Flag name={teamName(id)} />{teamName(id)}</span>
                          <span className="bet-team-group">Gr. {team?.group}</span>
                          <span className="bet-team-price">−{team?.price} pts</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
