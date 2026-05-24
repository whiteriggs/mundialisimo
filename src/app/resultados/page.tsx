"use client";

import NavBar from "@/components/NavBar";
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
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
import { buildTeamTotals, matchPoints, Phase, Match } from "@/lib/scoring";
import { fetchAllMatches, ApiAllMatch } from "@/lib/football-api";
import { buildStaticSchedule } from "@/lib/static-schedule";
import Flag from "@/components/Flag";

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

const ROUND_ORDER = ["J1", "J2", "J3", "Dieciseisavos", "Octavos", "Cuartos", "Semis", "3er Puesto", "Final"];
const STAGE_TO_ROUND: Record<string, string> = {
  LAST_32: "Dieciseisavos",
  LAST_16: "Octavos",
  QUARTER_FINALS: "Cuartos",
  SEMI_FINALS: "Semis",
  THIRD_PLACE: "3er Puesto",
  FINAL: "Final",
};
function matchRound(m: ApiAllMatch): string {
  if (m.phase === "groups") return `J${m.matchday ?? "?"}` ;
  return STAGE_TO_ROUND[m.stage] ?? m.stage;
}

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

export default function ResultadosPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [allApiMatches, setAllApiMatches] = useState<ApiAllMatch[]>([]);
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
        const [apiAll, manualSnap, betSnap] = await Promise.all([
          fetchAllMatches().catch((err) => {
            setApiError(err.message);
            return [] as ApiAllMatch[];
          }),
          getDocs(collection(db, "matches")),
          getDocs(collection(db, "bets")),
        ]);

        setAllApiMatches(apiAll.length > 0 ? apiAll : buildStaticSchedule());
        const finished: Match[] = apiAll
          .filter((m) => m.played)
          .map((m) => ({
            id: m.id,
            home: m.home,
            away: m.away,
            homeGoals: m.homeGoals ?? 0,
            awayGoals: m.awayGoals ?? 0,
            phase: m.phase,
            penalties: m.penalties,
            played: true,
          }));
        setMatches(finished);

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
    return { user: u, uid, total: favPts - antiPts, favPts, antiPts, confirmed: bet?.confirmed ?? false, bet };
  }).sort((a, b) => b.total - a.total);

  const roundData = useMemo(() => {
    // Partidos API jugados → rondas reales (J1/J2/J3/Octavos/…)
    const played = allApiMatches.filter((m) => m.played);
    const roundsSet = new Set(played.map(matchRound));
    const apiRounds = ROUND_ORDER.filter((r) => roundsSet.has(r));

    // Partidos manuales jugados → rondas por roundKey o por matchday/fase (legado)
    const manualRoundOf = (m: Match) => {
      if (m.roundKey) return m.roundKey;
      if (m.phase === "groups" && m.matchday) return `J${m.matchday}`;
      if (m.phase === "knockout") return "Elim.";
      return "3er P.";
    };
    const manualRoundsSet = new Set(manualMatches.filter((m) => m.played).map(manualRoundOf));
    const manualRounds = [...ROUND_ORDER, "Elim.", "3er P."].filter((r) => manualRoundsSet.has(r) && !apiRounds.includes(r));

    const activeRounds = [...apiRounds, ...manualRounds.filter((r) => !apiRounds.includes(r))];

    // Totales de equipo por ronda (API)
    const roundTotals: Record<string, Record<string, number>> = {};
    for (const round of apiRounds) {
      const rm = played.filter((m) => matchRound(m) === round).map((m) => ({
        id: m.id, home: m.home, away: m.away,
        homeGoals: m.homeGoals ?? 0, awayGoals: m.awayGoals ?? 0,
        phase: m.phase, penalties: m.penalties, played: true,
      }) as Match);
      roundTotals[round] = buildTeamTotals(rm);
    }
    // Totales de equipo por ronda (manuales)
    for (const round of manualRounds) {
      const rm = manualMatches.filter((m) => m.played && manualRoundOf(m) === round);
      roundTotals[round] = buildTeamTotals(rm);
    }

    // Puntos por jornada (no acumulados)
    const perRound: Record<string, Record<string, number>> = {};
    for (const r of rankings) {
      perRound[r.uid] = {};
      for (const round of activeRounds) {
        if (!r.bet?.confirmed) { perRound[r.uid][round] = NaN; continue; }
        const rt = roundTotals[round];
        const fav = (r.bet.favorites ?? []).reduce((s, id) => s + (rt[teamName(id)] ?? 0), 0);
        const anti = (r.bet.antiFavorites ?? []).reduce((s, id) => s + (rt[teamName(id)] ?? 0), 0);
        perRound[r.uid][round] = fav - anti;
      }
    }
    return { activeRounds, perRound };
  }, [allApiMatches, manualMatches, rankings]);

  function getGains(mPts: Record<string, number>) {
    return rankings
      .filter((r) => r.bet?.confirmed)
      .map((r) => ({
        user: r.user,
        uid: r.uid,
        gain: (r.bet!.favorites ?? []).reduce((s, id) => s + (mPts[teamName(id)] ?? 0), 0)
             - (r.bet!.antiFavorites ?? []).reduce((s, id) => s + (mPts[teamName(id)] ?? 0), 0),
      }));
  }

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

  const playedMatches = matches.filter((m) => m.played);

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
          <span className="sub">Resultados</span>
        </div>
        <NavBar user={currentUser} />
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

          {/* Rankings + evolución por jornada */}
          <div className="results-section">
            <div className="ranking-scroll">
              <table className="ranking-table">
                <thead>
                  <tr>
                    <th className="col-rank">#</th>
                    <th className="col-name">Participante</th>
                    <th className="col-pts">Total</th>
                    {roundData.activeRounds.map((r) => <th key={r} className="col-round">{r}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((r, i) => (
                    <tr
                      key={r.uid}
                      className={`${r.uid === currentUser?.toLowerCase() ? "row-me" : ""} ${!r.confirmed ? "row-pending" : ""}`}
                    >
                      <td className="col-rank">{r.confirmed ? i + 1 : "—"}</td>
                      <td className="col-name">
                        {r.user}
                        {r.uid === currentUser?.toLowerCase() ? <span className="me-badge"> (tú)</span> : ""}
                        {!r.confirmed ? <span className="pending-label"> · sin confirmar</span> : ""}
                      </td>
                      <td className="col-pts">{r.confirmed ? r.total : "—"}</td>
                      {roundData.activeRounds.map((round) => {
                        const pts = roundData.perRound[r.uid]?.[round];
                        return (
                          <td key={round} className="col-round">
                            {!r.confirmed ? "—" : isNaN(pts) ? "—" : pts > 0 ? `+${pts}` : `${pts}`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

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
                      const mPts = m.played ? matchPoints({ id: m.id, home: m.home, away: m.away, homeGoals: m.homeGoals ?? 0, awayGoals: m.awayGoals ?? 0, phase: m.phase, penalties: m.penalties, played: true }) : null;
                      const gains = mPts ? getGains(mPts) : [];
                      return (
                        <div key={m.id} className={m.played ? "match-card" : ""}>
                          <div className={`match-row${m.played ? " match-row--played" : ""}`}>
                            <span className="match-home"><Flag name={m.home} />{m.home}</span>
                            {m.played ? (
                              <span className="match-score">
                                {m.homeGoals} – {m.awayGoals}
                                {m.penalties && <span className="pens-badge">pen.</span>}
                              </span>
                            ) : m.id.startsWith("static-") ? (
                              <span className="match-time">Pendiente</span>
                            ) : (
                              <span className="match-time">{formatMatchTime(m.utcDate)}</span>
                            )}
                            <span className="match-away"><Flag name={m.away} />{m.away}</span>
                            <span />
                          </div>
                          {m.played && gains.length > 0 && (
                            <div className="match-gains">
                              {gains.map(({ user, uid, gain }) => (
                                <div key={uid} className="match-gain-row">
                                  <span className={uid === currentUser?.toLowerCase() ? "me-label" : ""}>{user}</span>
                                  <span className={`match-gain-pts${gain > 0 ? " pts-pos" : gain < 0 ? " pts-neg" : ""}`}>
                                    {gain > 0 ? `+${gain}` : `${gain}`}
                                  </span>
                                </div>
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
                      const gains = getGains(matchPoints(m));
                      return (
                        <div key={m.id} className="match-card">
                          <div className="match-row match-row--played">
                            <span className="match-home"><Flag name={m.home} />{m.home}</span>
                            <span className="match-score">
                              {m.homeGoals} – {m.awayGoals}
                              {m.penalties && <span className="pens-badge">pen.</span>}
                            </span>
                            <span className="match-away"><Flag name={m.away} />{m.away}</span>
                            <button className="match-delete" onClick={() => handleDelete(m.id)} title="Eliminar">✕</button>
                          </div>
                          {gains.length > 0 && (
                            <div className="match-gains">
                              {gains.map(({ user, uid, gain }) => (
                                <div key={uid} className="match-gain-row">
                                  <span className={uid === currentUser?.toLowerCase() ? "me-label" : ""}>{user}</span>
                                  <span className={`match-gain-pts${gain > 0 ? " pts-pos" : gain < 0 ? " pts-neg" : ""}`}>
                                    {gain > 0 ? `+${gain}` : `${gain}`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
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
    </main>
  );
}
