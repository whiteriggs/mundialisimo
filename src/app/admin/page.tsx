"use client";

import NavBar from "@/components/NavBar";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  getStoredUser,
  clearUser,
  getUsers,
  addUser,
  removeUser,
  deleteUserPassword,
} from "@/lib/auth";
import { TEAMS, GROUP_POOL } from "@/lib/teams";

// ─── Bet logic (same as /apuesta) ───────────────────────────────
const favoriteBounds  = { min: 9, max: 12 };
const antiBounds      = { min: 4, max: 6 };
const ticketBounds    = { min: 15, max: 22 };
const groupLabels     = Object.keys(GROUP_POOL);

function hasDuplicateGroup(ids: string[]) {
  const groups = ids
    .map((id) => TEAMS.find((t) => t.id === id)?.group)
    .filter(Boolean) as string[];
  return new Set(groups).size !== groups.length;
}

type Tab = "usuarios" | "contrasenas" | "apuestas";

export default function AdminPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("usuarios");

  // ── Usuarios state ────────────────────────────────────────────
  const [userList, setUserList]       = useState<string[]>([]);
  const [newUser, setNewUser]         = useState("");
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersMsg, setUsersMsg]       = useState<string | null>(null);

  // ── Contraseñas state ─────────────────────────────────────────
  const [pwUser, setPwUser]           = useState("");
  const [pwMsg, setPwMsg]             = useState<string | null>(null);
  const [pwBusy, setPwBusy]           = useState(false);

  // ── Apuestas state ────────────────────────────────────────────
  const [betUser, setBetUser]         = useState("");
  const [favorites, setFavorites]     = useState<string[]>([]);
  const [antiFavorites, setAntiFavorites] = useState<string[]>([]);
  const [superFavorite, setSuperFavorite] = useState<string | null>(null);
  const [confirmed, setConfirmed]     = useState(false);
  const [betLoading, setBetLoading]   = useState(false);
  const [betSaving, setBetSaving]     = useState(false);
  const [betMsg, setBetMsg]           = useState<string | null>(null);
  const [betLoaded, setBetLoaded]     = useState(false);

  // ── Auth guard ────────────────────────────────────────────────
  useEffect(() => {
    const user = getStoredUser();
    if (!user) { router.push("/login"); return; }
    if (user !== "Javi") { router.push("/apuesta"); return; }
    setCurrentUser(user);
    loadUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ── Helpers ───────────────────────────────────────────────────
  async function loadUsers() {
    setUsersLoading(true);
    try {
      setUserList(await getUsers());
    } finally {
      setUsersLoading(false);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    const name = newUser.trim();
    if (!name) return;
    try {
      await addUser(name);
      setNewUser("");
      setUsersMsg(`${name} añadido.`);
      await loadUsers();
    } catch {
      setUsersMsg("Error al añadir.");
    }
    setTimeout(() => setUsersMsg(null), 3000);
  }

  async function handleRemoveUser(username: string) {
    if (!confirm(`¿Eliminar a ${username} de la lista de usuarios?`)) return;
    try {
      await removeUser(username);
      setUsersMsg(`${username} eliminado.`);
      await loadUsers();
    } catch {
      setUsersMsg("Error al eliminar.");
    }
    setTimeout(() => setUsersMsg(null), 3000);
  }

  async function handleResetPassword() {
    if (!pwUser) return;
    if (!confirm(`¿Resetear la contraseña de ${pwUser}? Tendrá que crear una nueva al entrar.`)) return;
    setPwBusy(true);
    setPwMsg(null);
    try {
      await deleteUserPassword(pwUser);
      setPwMsg(`Contraseña de ${pwUser} eliminada.`);
    } catch {
      setPwMsg("Error al resetear.");
    } finally {
      setPwBusy(false);
    }
    setTimeout(() => setPwMsg(null), 4000);
  }

  async function handleLoadBet() {
    if (!betUser) return;
    setBetLoading(true);
    setBetMsg(null);
    setBetLoaded(false);
    try {
      const snap = await getDoc(doc(db, "bets", betUser.toLowerCase()));
      if (snap.exists()) {
        const data = snap.data();
        setFavorites(data.favorites ?? []);
        setAntiFavorites(data.antiFavorites ?? []);
        setSuperFavorite(data.superFavorite ?? null);
        setConfirmed(data.confirmed ?? false);
      } else {
        setFavorites([]);
        setAntiFavorites([]);
        setSuperFavorite(null);
        setConfirmed(false);
      }
      setBetLoaded(true);
    } catch {
      setBetMsg("Error al cargar la apuesta.");
    } finally {
      setBetLoading(false);
    }
  }

  async function handleSaveBet() {
    if (!betUser || !allValidBet) return;
    setBetSaving(true);
    setBetMsg(null);
    try {
      await setDoc(doc(db, "bets", betUser.toLowerCase()), {
        favorites,
        antiFavorites,
        superFavorite: superFavorite ?? null,
        confirmed: true,
        updatedAt: new Date(),
      });
      setConfirmed(true);
      setBetMsg(`Apuesta de ${betUser} guardada y confirmada.`);
    } catch {
      setBetMsg("Error al guardar.");
    } finally {
      setBetSaving(false);
    }
    setTimeout(() => setBetMsg(null), 4000);
  }

  async function handleResetBet() {
    if (!betUser) return;
    if (!confirm(`¿Resetear la apuesta de ${betUser}? Se guardará vacía.`)) return;
    setBetSaving(true);
    setBetMsg(null);
    try {
      await setDoc(doc(db, "bets", betUser.toLowerCase()), {
        favorites: [],
        antiFavorites: [],
        confirmed: false,
        updatedAt: new Date(),
      });
      setFavorites([]);
      setAntiFavorites([]);
      setSuperFavorite(null);
      setConfirmed(false);
      setBetMsg(`Apuesta de ${betUser} reseteada.`);
    } catch {
      setBetMsg("Error al resetear.");
      setBetSaving(false);
    }
    setTimeout(() => setBetMsg(null), 4000);
  }

  function toggleTeam(teamId: string, isFavorite: boolean) {
    if (isFavorite) {
      setFavorites((c) => c.includes(teamId) ? c.filter((id) => id !== teamId) : [...c, teamId]);
    } else {
      setAntiFavorites((c) => c.includes(teamId) ? c.filter((id) => id !== teamId) : [...c, teamId]);
    }
  }

  function hasGroupInFavorites(group: string) {
    return favorites.some((id) => TEAMS.find((t) => t.id === id)?.group === group);
  }
  function hasGroupInAntifavorites(group: string) {
    return antiFavorites.some((id) => TEAMS.find((t) => t.id === id)?.group === group);
  }

  const favoritesCost  = useMemo(() => favorites.reduce((s, id) => s + (TEAMS.find((t) => t.id === id)?.price ?? 0), 0), [favorites]);
  const antiDiscount   = useMemo(() => antiFavorites.reduce((s, id) => s + (TEAMS.find((t) => t.id === id)?.price ?? 0), 0), [antiFavorites]);
  const ticketCost     = favoritesCost - antiDiscount;
  const overlap        = favorites.some((id) => antiFavorites.includes(id));

  const validationsBet = [
    { ok: favorites.length >= favoriteBounds.min && favorites.length <= favoriteBounds.max, text: `Favoritos: ${favoriteBounds.min}-${favoriteBounds.max} (actual ${favorites.length})` },
    { ok: antiFavorites.length >= antiBounds.min && antiFavorites.length <= antiBounds.max, text: `Antifavoritos: ${antiBounds.min}-${antiBounds.max} (actual ${antiFavorites.length})` },
    { ok: !hasDuplicateGroup(favorites), text: "No repetir grupo en favoritos" },
    { ok: !hasDuplicateGroup(antiFavorites), text: "No repetir grupo en antifavoritos" },
    { ok: !overlap, text: "Un equipo no puede estar en ambos bloques" },
    { ok: ticketCost >= ticketBounds.min && ticketCost <= ticketBounds.max, text: `Coste entre ${ticketBounds.min} y ${ticketBounds.max} pts (actual ${ticketCost} pts)` },
  ];
  const allValidBet = validationsBet.every((r) => r.ok);

  function handleLogout() {
    clearUser();
    router.push("/login");
  }

  if (!currentUser) return null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialisimo</h1>
          <span className="sub">{currentUser}</span>
        </div>
        <NavBar user="Javi" />
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">⚙</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Panel de administración</div>
            <h2 className="hero-name">Admin</h2>
            <p className="lead">Gestión de usuarios, contraseñas y apuestas.</p>
          </div>
        </div>
      </section>

      <div className="admin-container">
        {/* Tabs */}
        <div className="admin-tabs">
          <button className={`admin-tab ${tab === "usuarios" ? "active" : ""}`} onClick={() => setTab("usuarios")}>Usuarios</button>
          <button className={`admin-tab ${tab === "contrasenas" ? "active" : ""}`} onClick={() => setTab("contrasenas")}>Contraseñas</button>
          <button className={`admin-tab ${tab === "apuestas" ? "active" : ""}`} onClick={() => setTab("apuestas")}>Apuestas</button>
        </div>

        {/* ── TAB: Usuarios ─────────────────────────────────────── */}
        {tab === "usuarios" && (
          <div className="admin-panel card">
            <h2>Gestión de usuarios</h2>
            {usersMsg && <p className="admin-msg">{usersMsg}</p>}
            {usersLoading ? (
              <p className="muted">Cargando…</p>
            ) : (
              <ul className="admin-user-list">
                {userList.map((u) => (
                  <li key={u} className="admin-user-item">
                    <span>{u}</span>
                    {u !== "Javi" && (
                      <button className="admin-remove-btn" onClick={() => handleRemoveUser(u)}>Eliminar</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form className="admin-add-form" onSubmit={handleAddUser}>
              <input
                type="text"
                value={newUser}
                onChange={(e) => setNewUser(e.target.value)}
                placeholder="Nombre del nuevo usuario"
                className="admin-input"
              />
              <button className="btn" type="submit">Añadir</button>
            </form>
          </div>
        )}

        {/* ── TAB: Contraseñas ──────────────────────────────────── */}
        {tab === "contrasenas" && (
          <div className="admin-panel card">
            <h2>Resetear contraseña</h2>
            <p className="muted">El usuario tendrá que crear una nueva contraseña la próxima vez que entre.</p>
            {pwMsg && <p className="admin-msg">{pwMsg}</p>}
            <div className="admin-row">
              <select className="admin-select" value={pwUser} onChange={(e) => setPwUser(e.target.value)}>
                <option value="">— Selecciona usuario —</option>
                {userList.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <button className="btn admin-danger-btn" onClick={handleResetPassword} disabled={!pwUser || pwBusy}>
                {pwBusy ? "Reseteando…" : "Resetear contraseña"}
              </button>
            </div>
          </div>
        )}

        {/* ── TAB: Apuestas ─────────────────────────────────────── */}
        {tab === "apuestas" && (
          <div className="admin-panel card">
            <h2>Editar apuesta</h2>
            <div className="admin-row">
              <select className="admin-select" value={betUser} onChange={(e) => { setBetUser(e.target.value); setBetLoaded(false); setBetMsg(null); }}>
                <option value="">— Selecciona usuario —</option>
                {userList.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <button className="btn" onClick={handleLoadBet} disabled={!betUser || betLoading}>
                {betLoading ? "Cargando…" : "Cargar apuesta"}
              </button>
            </div>

            {betMsg && <p className="admin-msg">{betMsg}</p>}

            {betLoaded && (
              <>
                <div className={`price-bar ${allValidBet ? "price-ok" : ticketCost > ticketBounds.max ? "price-over" : "price-under"}`} style={{ margin: "1rem 0", borderRadius: "8px" }}>
                  <div className="price-bar-inner">
                    <span className="price-bar-total">
                      <span className="price-bar-label">Apuesta de {betUser}</span>
                      <span className="price-bar-amount">{ticketCost} pts</span>
                    </span>
                    <span className="price-bar-range">rango válido: {ticketBounds.min}-{ticketBounds.max} pts</span>
                  </div>
                </div>

                <div className="bet-builder">
                  <section className="bet-section">
                    <div className="section-header">
                      <h3>Selecciona equipos</h3>
                      <div className="counters">
                        <span className="counter fav-counter"><span className="dot-fav" /> Favoritos {favorites.length}/9-12</span>
                        <span className="counter anti-counter"><span className="dot-anti" /> Antifavoritos {antiFavorites.length}/4-6</span>
                      </div>
                    </div>
                    <div className="groups-grid">
                      {groupLabels.map((group) => (
                        <div className="group-card" key={group}>
                          <h3 className="group-label">Grupo {group}</h3>
                          <div className="group-teams">
                            {(GROUP_POOL[group] ?? []).map((tname, idx) => {
                              const teamId = `${group}-${idx + 1}`;
                              const isFav  = favorites.includes(teamId);
                              const isAnti = antiFavorites.includes(teamId);
                              const team   = TEAMS.find((t) => t.id === teamId);
                              return (
                                <div className="team-dual" key={teamId}>
                                  <div className="team-info">
                                    <span className="team-name">{tname}</span>
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
                                    <span className="team-price">{team?.price ?? 0} pts</span>
                                  </div>
                                  <div className="team-controls">
                                    <button
                                      className={`team-btn fav-btn ${isFav ? "active" : ""} ${!isFav && (favorites.length >= 12 || hasGroupInFavorites(group) || isAnti) ? "disabled" : ""}`}
                                      onClick={() => toggleTeam(teamId, true)}
                                      disabled={!isFav && (favorites.length >= 12 || hasGroupInFavorites(group) || isAnti)}
                                    />
                                    <button
                                      className={`team-btn anti-btn ${isAnti ? "active" : ""} ${!isAnti && (antiFavorites.length >= 6 || hasGroupInAntifavorites(group) || isFav) ? "disabled" : ""}`}
                                      onClick={() => toggleTeam(teamId, false)}
                                      disabled={!isAnti && (antiFavorites.length >= 6 || hasGroupInAntifavorites(group) || isFav)}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bet-actions">
                      <button
                        className={`btn confirm-btn ${allValidBet ? "" : "confirm-btn-disabled"}`}
                        disabled={!allValidBet || betSaving}
                        onClick={handleSaveBet}
                      >
                        {betSaving ? "Guardando…" : allValidBet ? `Guardar apuesta de ${betUser}` : "Completa la apuesta para guardar"}
                      </button>
                      <button
                        className="btn admin-danger-btn"
                        disabled={betSaving}
                        onClick={handleResetBet}
                        style={{ marginLeft: "0.75rem" }}
                      >
                        Resetear apuesta
                      </button>
                    </div>
                  </section>
                </div>

                <div className="grid" style={{ marginTop: "1.5rem" }}>
                  <article className="card highlight summary-card">
                    <h2>Resumen</h2>
                    <p>Favoritos: {favoritesCost} pts</p>
                    <p>Antifavoritos: −{antiDiscount} pts</p>
                    <p><strong>Total: {ticketCost} pts</strong></p>
                    <ul className="checks">
                      {validationsBet.map((r) => (
                        <li className={r.ok ? "ok" : "ko"} key={r.text}>{r.ok ? "✓" : "✗"} {r.text}</li>
                      ))}
                    </ul>
                  </article>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
