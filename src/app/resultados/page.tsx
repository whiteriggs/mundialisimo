"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getStoredUser, clearUser, USERS } from "@/lib/auth";
import { TEAM_NAMES, teamName } from "@/lib/teams";
import { buildTeamTotals, Phase, Match } from "@/lib/scoring";
import { fetchFinishedMatches } from "@/lib/football-api";

type BetDoc = {
  user: string;
  favorites: string[];
  antiFavorites: string[];
  confirmed: boolean;
};

const PHASE_LABELS: Record<Phase, string> = {
  groups: "Grupos",
  third: "3er/4º puesto",
  knockout: "Eliminatoria",
};

const EMPTY_FORM = {
  home: "",
  away: "",
  homeGoals: 0,
  awayGoals: 0,
  phase: "groups" as Phase,
  penalties: false,
};

export default function ResultadosPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [manualMatches, setManualMatches] = useState<Match[]>([]);
  const [bets, setBets] = useState<BetDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { router.push("/login"); return; }
    setCurrentUser(user);

    async function load() {
      try {
        const [apiMatches, manualSnap, betSnap] = await Promise.all([
          fetchFinishedMatches().catch((err) => {
            setApiError(err.message);
            return [] as Match[];
          }),
          getDocs(collection(db, "matches")),
          getDocs(collection(db, "bets")),
        ]);

        const sorted = [...apiMatches].sort((a, b) => {
          const order: Phase[] = ["groups", "third", "knockout"];
          return order.indexOf(a.phase) - order.indexOf(b.phase);
        });
        setMatches(sorted);

        const manual: Match[] = manualSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Match, "id">),
        }));
        setManualMatches(manual);

        setBets(
          betSnap.docs.map((d) => {
            const raw = d.data() as Partial<Omit<BetDoc, "user">>;
            return {
              user: d.id,
              favorites: raw.favorites ?? [],
              antiFavorites: raw.antiFavorites ?? [],
              confirmed: raw.confirmed ?? false,
            };
          })
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  const teamTotals = buildTeamTotals([...matches, ...manualMatches]);

  const rankings = USERS.map((u) => {
    const uid = u.toLowerCase();
    const bet = bets.find((b) => b.user === uid);
    const favPts = bet?.confirmed
      ? (bet.favorites ?? []).reduce((s, id) => s + (teamTotals[teamName(id)] ?? 0), 0)
      : 0;
    const antiPts = bet?.confirmed
      ? (bet.antiFavorites ?? []).reduce((s, id) => s + (teamTotals[teamName(id)] ?? 0), 0)
      : 0;
    return { user: u, uid, total: favPts - antiPts, favPts, antiPts, confirmed: bet?.confirmed ?? false };
  }).sort((a, b) => b.total - a.total);

  function handleLogout() {
    clearUser();
    router.push("/login");
  }

  async function handleAddMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!form.home || !form.away || form.home === form.away) return;
    setSaving(true);
    setFormError(null);
    try {
      const newMatch: Omit<Match, "id"> = {
        home: form.home,
        away: form.away,
        homeGoals: form.homeGoals,
        awayGoals: form.awayGoals,
        phase: form.phase,
        penalties: form.phase === "knockout" ? form.penalties : false,
        played: true,
      };
      const docRef = await addDoc(collection(db, "matches"), newMatch);
      setManualMatches((prev) => [...prev, { id: docRef.id, ...newMatch }]);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDoc(doc(db, "matches", id));
      setManualMatches((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al eliminar.");
    }
  }

  const playedMatches = matches.filter((m) => m.played);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialisimo</h1>
          <span className="sub">Resultados</span>
        </div>
        <nav className="topbar-nav">
          <Link href="/apuesta">Mi apuesta</Link>
          <Link href="/grupos">Grupos</Link>
          <Link href="/apuestas">Apuestas</Link>
          <Link href="/eliminatorias">Eliminatorias</Link>
          {currentUser === "Javi" && <Link href="/admin">Admin</Link>}
        </nav>
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">⚽</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Porra Mundial 2026</div>
            <h2 className="hero-name">Clasificación</h2>
            <p className="lead">
              {playedMatches.length === 0
                ? "El Mundial empieza el 11 de junio. La clasificación se actualizará automáticamente."
                : `${playedMatches.length} partido${playedMatches.length !== 1 ? "s" : ""} jugado${playedMatches.length !== 1 ? "s" : ""} · datos de football-data.org`}
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="loading-screen"><p className="muted">Cargando…</p></div>
      ) : (
        <>
          {apiError && (
            <div className="results-section">
              <p className="api-notice">Los datos de partidos se cargarán automáticamente cuando empiece el Mundial (11 jun 2026).</p>
            </div>
          )}

          {/* Rankings */}
          <div className="results-section">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Participante</th>
                  <th>Puntos</th>
                  <th className="col-detail">Favoritos</th>
                  <th className="col-detail">Antifav.</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r, i) => (
                  <tr
                    key={r.uid}
                    className={`${r.uid === currentUser?.toLowerCase() ? "row-me" : ""} ${!r.confirmed ? "row-pending" : ""}`}
                  >
                    <td className="col-rank">{r.confirmed ? i + 1 : "—"}</td>
                    <td>
                      {r.user}
                      {r.uid === currentUser?.toLowerCase() ? <span className="me-badge"> (tú)</span> : ""}
                      {!r.confirmed ? <span className="pending-label"> · sin confirmar</span> : ""}
                    </td>
                    <td className="col-pts">{r.confirmed ? r.total : "—"}</td>
                    <td className="col-detail">{r.confirmed ? `+${r.favPts}` : "—"}</td>
                    <td className="col-detail">{r.confirmed ? `−${r.antiPts}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Match list — API */}
          {playedMatches.length > 0 && (
            <div className="results-section">
              <h2 className="results-title">Partidos jugados</h2>
              <div className="matches-list">
                {(["groups", "third", "knockout"] as Phase[]).map((phase) => {
                  const group = playedMatches.filter((m) => m.phase === phase);
                  if (group.length === 0) return null;
                  return (
                    <div key={phase}>
                      <h3 className="matches-phase-label">{PHASE_LABELS[phase]}</h3>
                      {group.map((m) => (
                        <div className="match-row" key={m.id}>
                          <span className="match-home">{m.home}</span>
                          <span className="match-score">
                            {m.homeGoals} – {m.awayGoals}
                            {m.penalties && <span className="pens-badge">pen.</span>}
                          </span>
                          <span className="match-away">{m.away}</span>
                          <span />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manual entry section */}
          <div className="results-section">
            <button
              className="toggle-form-btn"
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "▲ Ocultar entrada manual" : "▼ Añadir resultado a mano"}
            </button>

            {showForm && (
              <>
                <form className="match-form card" style={{ marginTop: 12 }} onSubmit={handleAddMatch}>
                  <div className="match-form-teams">
                    <div className="login-field">
                      <label>Local</label>
                      <select value={form.home} onChange={(e) => setForm((f) => ({ ...f, home: e.target.value }))} required>
                        <option value="">— Equipo —</option>
                        {TEAM_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="match-form-score">
                      <input type="number" min={0} max={30} value={form.homeGoals} onChange={(e) => setForm((f) => ({ ...f, homeGoals: Number(e.target.value) }))} />
                      <span className="score-sep">–</span>
                      <input type="number" min={0} max={30} value={form.awayGoals} onChange={(e) => setForm((f) => ({ ...f, awayGoals: Number(e.target.value) }))} />
                    </div>
                    <div className="login-field">
                      <label>Visitante</label>
                      <select value={form.away} onChange={(e) => setForm((f) => ({ ...f, away: e.target.value }))} required>
                        <option value="">— Equipo —</option>
                        {TEAM_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="match-form-meta">
                    <div className="login-field">
                      <label>Fase</label>
                      <select value={form.phase} onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value as Phase, penalties: false }))}>
                        <option value="groups">Grupos</option>
                        <option value="knockout">Eliminatoria</option>
                        <option value="third">3er / 4º puesto</option>
                      </select>
                    </div>
                    {form.phase === "knockout" && (
                      <label className="penalties-check">
                        <input type="checkbox" checked={form.penalties} onChange={(e) => setForm((f) => ({ ...f, penalties: e.target.checked }))} />
                        Decidido por penaltis
                      </label>
                    )}
                  </div>
                  <button className="btn" type="submit" disabled={saving || !form.home || !form.away || form.home === form.away}>
                    {saving ? "Guardando…" : "Añadir partido"}
                  </button>
                  {formError && <p className="login-error">{formError}</p>}
                </form>

                {manualMatches.length > 0 && (
                  <div className="matches-list" style={{ marginTop: 16 }}>
                    <h3 className="matches-phase-label">Partidos manuales</h3>
                    {manualMatches.map((m) => (
                      <div className="match-row" key={m.id}>
                        <span className="match-home">{m.home}</span>
                        <span className="match-score">
                          {m.homeGoals} – {m.awayGoals}
                          {m.penalties && <span className="pens-badge">pen.</span>}
                        </span>
                        <span className="match-away">{m.away}</span>
                        <button className="match-delete" onClick={() => handleDelete(m.id)} title="Eliminar">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}
