"use client";

import NavBar from "@/components/NavBar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getStoredUser, clearUser } from "@/lib/auth";
import { ApiStandingGroup, toInternalName, fetchAllMatches, ApiAllMatch, isLiveStatus } from "@/lib/football-api";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { buildGroupStandings } from "@/lib/standings";
import { GROUP_POOL, TEAM_NAMES } from "@/lib/teams";
import { Phase, Match } from "@/lib/scoring";
import { buildStaticSchedule } from "@/lib/static-schedule";
import { tvChannelsFor } from "@/lib/tv-channels";
import Flag from "@/components/Flag";

const ROUND_OPTIONS: { key: string; label: string; phase: Phase; matchday: number | null }[] = [
  { key: "J1",            label: "J1 — Fase de grupos",   phase: "groups",   matchday: 1 },
  { key: "J2",            label: "J2 — Fase de grupos",   phase: "groups",   matchday: 2 },
  { key: "J3",            label: "J3 — Fase de grupos",   phase: "groups",   matchday: 3 },
  { key: "Dieciseisavos", label: "Dieciseisavos de Final", phase: "knockout", matchday: null },
  { key: "Octavos",       label: "Octavos de Final",       phase: "knockout", matchday: null },
  { key: "Cuartos",       label: "Cuartos de Final",       phase: "knockout", matchday: null },
  { key: "Semis",         label: "Semifinales",            phase: "knockout", matchday: null },
  { key: "Final",         label: "Final",                  phase: "knockout", matchday: null },
  { key: "3er Puesto",    label: "3er / 4º Puesto",        phase: "third",    matchday: null },
];

const EMPTY_FORM = {
  home: "",
  away: "",
  homeGoals: 0,
  awayGoals: 0,
  roundKey: "J1",
  penalties: false,
};

function sign(n: number) {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${n}`;
  return "0";
}

function groupLetter(apiGroup: string) {
  return apiGroup.replace("GROUP_", "");
}

export default function GruposPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"grupos" | "resultados">("grupos");
  const [loading, setLoading] = useState(true);

  const [allApiMatches, setAllApiMatches] = useState<ApiAllMatch[]>([]);
  const [manualMatches, setManualMatches] = useState<Match[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [user, setUser] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const apiAll = await fetchAllMatches().catch(() => [] as ApiAllMatch[]);
    setAllApiMatches(apiAll.length > 0 ? apiAll : buildStaticSchedule());
    try {
      const manualSnap = await getDocs(collection(db, "matches"));
      setManualMatches(manualSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Match, "id">) })));
    } catch { /* ignorar */ }
  }, []);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.push("/login"); return; }
    setUser(u);
    loadData().finally(() => setLoading(false));
  }, [router, loadData]);

  useLiveRefresh(loadData);

  // Clasificación de grupos calculada en el cliente a partir de los partidos en
  // vivo (Worker) + resultados manuales. Cuenta también los partidos en juego
  // (IN_PLAY/PAUSED) con su marcador parcial, así la tabla se mueve en directo.
  const groups = useMemo<ApiStandingGroup[]>(() => {
    const groupMatches: Match[] = [
      ...allApiMatches
        .filter((m) => m.phase === "groups" && (m.played || isLiveStatus(m.status)))
        .map((m) => ({
          id: m.id,
          home: m.home,
          away: m.away,
          homeGoals: m.homeGoals ?? 0,
          awayGoals: m.awayGoals ?? 0,
          phase: "groups" as Phase,
          penalties: m.penalties,
          played: true,
        })),
      ...manualMatches.filter((m) => m.phase === "groups" && m.played),
    ];
    const byLetter = buildGroupStandings(groupMatches);
    return Object.entries(byLetter).map(([letter, table]) => ({
      group: `GROUP_${letter}`,
      table: table.map((s, i) => ({
        position: i + 1,
        team: { name: s.name },
        playedGames: s.played,
        won: s.won,
        draw: s.drawn,
        lost: s.lost,
        goalsFor: s.gf,
        goalsAgainst: s.ga,
        goalDifference: s.gd,
        points: s.pts,
      })),
    }));
  }, [allApiMatches, manualMatches]);

  const matchCount = useMemo(
    () => groups.reduce((sum, g) => sum + (g.table[0]?.playedGames ?? 0), 0),
    [groups]
  );

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
      const roundOpt = ROUND_OPTIONS.find((r) => r.key === form.roundKey)!;
      const newMatch: Omit<Match, "id"> = {
        home: form.home,
        away: form.away,
        homeGoals: form.homeGoals,
        awayGoals: form.awayGoals,
        phase: roundOpt.phase,
        penalties: roundOpt.phase === "knockout" ? form.penalties : false,
        played: true,
        matchday: roundOpt.matchday,
        roundKey: form.roundKey,
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

  function formatMatchDay(utcDate: string): string {
    return new Date(utcDate).toLocaleDateString("es-ES", {
      weekday: "short", day: "numeric", month: "short"
    });
  }

  function formatMatchTime(utcDate: string): string {
    return new Date(utcDate).toLocaleTimeString("es-ES", {
      hour: "2-digit", minute: "2-digit"
    });
  }

  const matchesByDay = allApiMatches.reduce<Map<string, ApiAllMatch[]>>((acc, m) => {
    const day = m.utcDate.slice(0, 10);
    if (!acc.has(day)) acc.set(day, []);
    acc.get(day)!.push(m);
    return acc;
  }, new Map());

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialisimo</h1>
          <span className="sub">Grupos/Resultados</span>
        </div>
        <NavBar user={user} />
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">⚽</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Mundial 2026 · Fase de grupos</div>
            <h2 className="hero-name">{tab === "grupos" ? "Clasificación de grupos" : "Resultados"}</h2>
            <p className="lead">
              {tab === "grupos"
                ? (matchCount === 0
                    ? "Los datos se actualizarán automáticamente cuando empiece el Mundial el 11 de junio."
                    : `${matchCount} partido${matchCount !== 1 ? "s" : ""} de grupo jugado${matchCount !== 1 ? "s" : ""}.`)
                : "Calendario, horarios y resultados de todos los partidos."}
            </p>
          </div>
        </div>
      </section>

      {loading && <div className="loading-screen"><p className="muted">Cargando datos oficiales…</p></div>}

      {!loading && (
        <>
          {/* Selector de pestañas */}
          <div className="results-section">
            <div className="tabs" role="tablist">
              <button
                role="tab"
                aria-selected={tab === "grupos"}
                className={`tab ${tab === "grupos" ? "tab-active" : ""}`}
                onClick={() => setTab("grupos")}
              >
                Grupos
              </button>
              <button
                role="tab"
                aria-selected={tab === "resultados"}
                className={`tab ${tab === "resultados" ? "tab-active" : ""}`}
                onClick={() => setTab("resultados")}
              >
                Resultados
              </button>
            </div>
          </div>

          {tab === "grupos" && matchCount === 0 && (
            <>
              <div className="results-section">
                <p className="api-notice">El Mundial empieza el 11 de junio. Aquí están los grupos ya definidos — las puntuaciones aparecerán cuando comiencen los partidos.</p>
              </div>
              <div className="groups-standings-grid">
                {Object.entries(GROUP_POOL).map(([letter, teams]) => (
                  <div className="group-standing-card" key={letter}>
                    <h3 className="group-standing-title">Grupo {letter}</h3>
                    <table className="standing-table">
                      <thead>
                        <tr>
                          <th className="st-pos">#</th>
                          <th className="st-name">Equipo</th>
                          <th>PJ</th><th>V</th><th>E</th><th>D</th>
                          <th>GF</th><th>GC</th><th>DG</th>
                          <th className="st-pts">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teams.map((name, idx) => (
                          <tr key={name}>
                            <td className="st-pos">{idx + 1}</td>
                            <td className="st-name"><Flag name={name} />{name}</td>
                            <td>–</td><td>–</td><td>–</td><td>–</td>
                            <td>–</td><td>–</td><td>–</td>
                            <td className="st-pts">–</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "grupos" && matchCount > 0 && (
            <div className="groups-standings-grid">
              {groups.map((g) => {
                const letter = groupLetter(g.group);
                return (
                  <div className="group-standing-card" key={g.group}>
                    <h3 className="group-standing-title">Grupo {letter}</h3>
                    <table className="standing-table">
                      <thead>
                        <tr>
                          <th className="st-pos">#</th>
                          <th className="st-name">Equipo</th>
                          <th title="Partidos jugados">PJ</th>
                          <th title="Victorias">V</th>
                          <th title="Empates">E</th>
                          <th title="Derrotas">D</th>
                          <th title="Goles a favor">GF</th>
                          <th title="Goles en contra">GC</th>
                          <th title="Diferencia de goles">DG</th>
                          <th title="Puntos" className="st-pts">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.table.map((row, idx) => (
                          <tr key={row.team.name} className={idx < 2 ? "row-qualifier" : ""}>
                            <td className="st-pos">{row.position}</td>
                            <td className="st-name"><Flag name={toInternalName(row.team.name)} />{toInternalName(row.team.name)}</td>
                            <td>{row.playedGames}</td>
                            <td>{row.won}</td>
                            <td>{row.draw}</td>
                            <td>{row.lost}</td>
                            <td>{row.goalsFor}</td>
                            <td>{row.goalsAgainst}</td>
                            <td className={row.goalDifference > 0 ? "gd-pos" : row.goalDifference < 0 ? "gd-neg" : ""}>
                              {sign(row.goalDifference)}
                            </td>
                            <td className="st-pts">{row.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "resultados" && (
            <>
              {/* Calendario completo */}
              {matchesByDay.size > 0 && (
                <div className="results-section">
                  <h2 className="results-title">Partidos</h2>
                  <div className="matches-list">
                    {Array.from(matchesByDay.entries()).map(([day, dayMatches]) => (
                      <div key={day}>
                        <h3 className="matches-phase-label">
                          {formatMatchDay(dayMatches[0].utcDate)} · {dayMatches.length} partido{dayMatches.length !== 1 ? "s" : ""}
                        </h3>
                        {dayMatches.map((m) => {
                          const live = isLiveStatus(m.status);
                          return (m.played || live) ? (
                            <div key={m.id} className="match-card">
                              <div className="match-card-info">
                                <span className="match-home"><Flag name={m.home} />{m.home}</span>
                                <span className="match-score">
                                  {m.homeGoals} – {m.awayGoals}
                                  {live && <span className="live-badge">EN VIVO</span>}
                                  {m.penalties && <span className="pens-badge">pen.</span>}
                                </span>
                                <span className="match-away"><Flag name={m.away} />{m.away}</span>
                              </div>
                            </div>
                          ) : (
                            <div key={m.id} className="match-row">
                              <span className="match-teams">
                                <span className="match-home"><Flag name={m.home} />{m.home}</span>
                                <span className="match-vs">vs.</span>
                                <span className="match-away"><Flag name={m.away} />{m.away}</span>
                              </span>
                              {m.id.startsWith("static-") ? (
                                <span className="match-time">Pendiente</span>
                              ) : (
                                <span className="match-time">{formatMatchTime(m.utcDate)}</span>
                              )}
                              {m.id.startsWith("static-") ? (
                                <span className="match-tv" />
                              ) : (
                                <div className="match-tv">
                                  {tvChannelsFor(m).map((ch) => (
                                    <a
                                      key={ch.name}
                                      className={`tv-chip tv-${ch.kind}`}
                                      href={ch.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={`${ch.name} · ${ch.kind === "gratis" ? "Gratis" : "De pago"}`}
                                    >
                                      {ch.name}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
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
                          <label>Ronda</label>
                          <select value={form.roundKey} onChange={(e) => setForm((f) => ({ ...f, roundKey: e.target.value, penalties: false }))}>
                            {ROUND_OPTIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                          </select>
                        </div>
                        {ROUND_OPTIONS.find((r) => r.key === form.roundKey)?.phase === "knockout" && (
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
                        {manualMatches.map((m) => {
                          return (
                            <div key={m.id} className="match-card">
                              <div className="match-card-info">
                                <span className="match-home"><Flag name={m.home} />{m.home}</span>
                                <span className="match-score">
                                  {m.homeGoals} – {m.awayGoals}
                                  {m.penalties && <span className="pens-badge">pen.</span>}
                                </span>
                                <span className="match-away"><Flag name={m.away} />{m.away}</span>
                              </div>
                              <button className="match-delete" onClick={() => handleDelete(m.id)} title="Eliminar">✕</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
