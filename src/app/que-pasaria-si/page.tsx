"use client";

import NavBar from "@/components/NavBar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearUser } from "@/lib/auth";
import { fetchAllMatches, type ApiAllMatch } from "@/lib/football-api";
import { fetchUsersRest, fetchBetsRest, type BetDoc } from "@/lib/leaderboard";
import { fetchUserSim, saveUserSim, type Predictions, type KnockoutScores } from "@/lib/predictions";
import { buildTeamTotals, calcUserScore, type Match } from "@/lib/scoring";
import { buildGroupStandings } from "@/lib/standings";
import { simulateBracket, bracketToMatches } from "@/lib/simulateBracket";
import { teamName } from "@/lib/teams";
import { getGroupId } from "@/lib/group";
import Flag from "@/components/Flag";

function sign(n: number) {
  return n > 0 ? `+${n}` : `${n}`;
}

export default function QuePasariaSiPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiMatches, setApiMatches] = useState<ApiAllMatch[]>([]);
  const [bets, setBets] = useState<BetDoc[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [predictions, setPredictions] = useState<Predictions>({});
  const [knockout, setKnockout] = useState<KnockoutScores>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.push("/login"); return; }
    setUser(u);
    Promise.all([
      fetchAllMatches().catch(() => [] as ApiAllMatch[]),
      fetchUsersRest(getGroupId()),
      fetchBetsRest(getGroupId()),
      fetchUserSim(u),
    ])
      .then(([m, us, bs, sim]) => {
        setApiMatches(m);
        setUsers(us);
        setBets(bs);
        setPredictions(sim.results);
        setKnockout(sim.knockout);
      })
      .finally(() => setLoading(false));
  }, [router]);

  // Todos los partidos de grupos con rivales conocidos (jugados y por jugar),
  // en orden cronológico. Los jugados se muestran fijos; los demás, editables.
  const groupMatches = useMemo(
    () =>
      apiMatches
        .filter((m) => m.phase === "groups" && m.home !== "Por determinar" && m.away !== "Por determinar")
        .sort((a, b) => a.utcDate.localeCompare(b.utcDate)),
    [apiMatches]
  );

  const pendingGroupMatches = useMemo(
    () => groupMatches.filter((m) => !m.played),
    [groupMatches]
  );

  // Partidos de grupos para el cálculo: el resultado REAL siempre manda; el
  // pronóstico solo cuenta en partidos aún no jugados.
  const groupSimMatches = useMemo<Match[]>(() => {
    const real: Match[] = apiMatches
      .filter((m) => m.played && m.phase === "groups")
      .map((m) => ({
        id: m.id, home: m.home, away: m.away,
        homeGoals: m.homeGoals ?? 0, awayGoals: m.awayGoals ?? 0,
        phase: "groups", penalties: false, played: true,
      }));
    const predicted: Match[] = pendingGroupMatches
      .filter((m) => predictions[m.id])
      .map((m) => ({
        id: m.id, home: m.home, away: m.away,
        homeGoals: predictions[m.id].h, awayGoals: predictions[m.id].a,
        phase: "groups", penalties: false, played: true,
      }));
    return [...real, ...predicted];
  }, [apiMatches, pendingGroupMatches, predictions]);

  const groupStandings = useMemo(() => buildGroupStandings(groupSimMatches), [groupSimMatches]);

  // Cuadro de eliminatorias simulado: clasificados según los grupos + marcadores
  // que pone el usuario, propagados ronda a ronda.
  const bracket = useMemo(() => simulateBracket(groupStandings, knockout), [groupStandings, knockout]);

  // Los goles de eliminatorias TAMBIÉN puntdan en la porra: sumamos los cruces
  // con marcador al cómputo de cada selección.
  const teamTotals = useMemo(
    () => buildTeamTotals([...groupSimMatches, ...bracketToMatches(bracket)]),
    [groupSimMatches, bracket]
  );

  const leaderboard = useMemo(() => {
    return users
      .map((u) => {
        const bet = bets.find((b) => b.user === u.toLowerCase());
        const total = bet?.confirmed
          ? calcUserScore(bet.favorites, bet.antiFavorites, teamTotals)
          : 0;
        return { user: u, total, confirmed: bet?.confirmed ?? false };
      })
      .sort((a, b) => b.total - a.total);
  }, [users, bets, teamTotals]);

  const bracketByRound = useMemo(() => {
    const r: Record<string, typeof bracket> = { R32: [], R16: [], QF: [], SF: [], FINAL: [] };
    for (const m of bracket) r[m.round].push(m);
    return r;
  }, [bracket]);
  const champion = useMemo(() => {
    const final = bracket.find((m) => m.round === "FINAL");
    if (!final || !final.winner) return null;
    return final.winner === "home" ? final.home : final.away;
  }, [bracket]);

  // Autosave con debounce (guarda resultados de grupos + marcadores de eliminatorias).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((results: Predictions, ko: KnockoutScores) => {
    if (!user) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveUserSim(user, { results, knockout: ko })
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("idle"));
    }, 700);
  }, [user]);

  function setScore(matchId: string, side: "h" | "a", value: string) {
    const n = Math.max(0, Math.min(30, Number(value.replace(/[^0-9]/g, "")) || 0));
    setPredictions((prev) => {
      const cur = prev[matchId] ?? { h: 0, a: 0 };
      const next = { ...prev, [matchId]: { ...cur, [side]: n } };
      persist(next, knockout);
      return next;
    });
  }

  function clearPrediction(matchId: string) {
    setPredictions((prev) => {
      const next = { ...prev };
      delete next[matchId];
      persist(next, knockout);
      return next;
    });
  }

  function setKoScore(matchId: string, side: "h" | "a", value: string) {
    const n = Math.max(0, Math.min(30, Number(value.replace(/[^0-9]/g, "")) || 0));
    setKnockout((prev) => {
      const cur = prev[matchId] ?? { h: 0, a: 0 };
      const merged = { ...cur, [side]: n };
      // Si deja de haber empate, el penalti elegido ya no aplica.
      if (merged.h !== merged.a) delete merged.pen;
      const next = { ...prev, [matchId]: merged };
      persist(predictions, next);
      return next;
    });
  }

  function setKoPen(matchId: string, side: "home" | "away") {
    setKnockout((prev) => {
      const cur = prev[matchId];
      if (!cur) return prev;
      const next = { ...prev, [matchId]: { ...cur, pen: cur.pen === side ? undefined : side } };
      persist(predictions, next);
      return next;
    });
  }

  function clearKo(matchId: string) {
    setKnockout((prev) => {
      const next = { ...prev };
      delete next[matchId];
      persist(predictions, next);
      return next;
    });
  }

  function handleLogout() {
    clearUser();
    router.push("/login");
  }

  const predictedCount = pendingGroupMatches.filter((m) => predictions[m.id]).length;

  // Agrupar TODOS los partidos por día (jugados y por jugar).
  const byDay = useMemo(() => {
    const map = new Map<string, ApiAllMatch[]>();
    for (const m of groupMatches) {
      const day = m.utcDate.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(m);
    }
    return map;
  }, [groupMatches]);

  function fmtDay(iso: string) {
    return new Date(iso).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialisimo</h1>
          <span className="sub">Qué pasaría si…</span>
        </div>
        <NavBar user={user} />
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">🔮</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Mundial 2026 · Simulador personal</div>
            <h2 className="hero-name">Qué pasaría si…</h2>
            <p className="lead">
              Pon los resultados que tú quieras en los partidos por jugar y mira cómo quedaría la porra. Solo tú ves tu simulación.
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="loading-screen"><p className="muted">Cargando…</p></div>
      ) : (
        <div className="qps-grid">
          {/* Columna de pronósticos */}
          <section className="results-section">
            <h2 className="results-title">
              Tus pronósticos
              <span className="qps-counter">{predictedCount}/{pendingGroupMatches.length}</span>
              <span className={`qps-save qps-save-${saveState}`}>
                {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado ✓" : ""}
              </span>
            </h2>
            {groupMatches.length === 0 ? (
              <p className="muted">Aún no hay partidos de grupos disponibles.</p>
            ) : (
              <div className="qps-matches">
                {Array.from(byDay.entries()).map(([day, dayMatches]) => (
                  <div key={day} className="qps-day">
                    <h3 className="matches-phase-label">{fmtDay(dayMatches[0].utcDate)}</h3>
                    {dayMatches.map((m) => {
                      // Partido ya jugado: resultado real, fijo (no editable).
                      if (m.played) {
                        return (
                          <div key={m.id} className="qps-match qps-match--played">
                            <span className="qps-team qps-team--home"><Flag name={m.home} />{m.home}</span>
                            <div className="qps-score qps-score--final">
                              <span className="qps-final">{m.homeGoals ?? 0}</span>
                              <span className="qps-dash">–</span>
                              <span className="qps-final">{m.awayGoals ?? 0}</span>
                            </div>
                            <span className="qps-team qps-team--away">{m.away}<Flag name={m.away} /></span>
                            <span className="qps-played-tag">Jugado</span>
                          </div>
                        );
                      }
                      // Partido por jugar: editable.
                      const p = predictions[m.id];
                      return (
                        <div key={m.id} className={`qps-match${p ? " qps-match--set" : ""}`}>
                          <span className="qps-team qps-team--home"><Flag name={m.home} />{m.home}</span>
                          <div className="qps-score">
                            <input
                              type="text" inputMode="numeric" maxLength={2}
                              value={p ? String(p.h) : ""}
                              placeholder="-"
                              onChange={(e) => setScore(m.id, "h", e.target.value)}
                              aria-label={`Goles ${m.home}`}
                            />
                            <span className="qps-dash">–</span>
                            <input
                              type="text" inputMode="numeric" maxLength={2}
                              value={p ? String(p.a) : ""}
                              placeholder="-"
                              onChange={(e) => setScore(m.id, "a", e.target.value)}
                              aria-label={`Goles ${m.away}`}
                            />
                          </div>
                          <span className="qps-team qps-team--away">{m.away}<Flag name={m.away} /></span>
                          {p && (
                            <button className="qps-clear" onClick={() => clearPrediction(m.id)} title="Borrar pronóstico">×</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Columna de resultados simulados */}
          <section className="results-section qps-results">
            <h2 className="results-title">Clasificación simulada de la porra</h2>
            <div className="standings-wrap">
              <table className="standings-table">
                <thead>
                  <tr><th className="st-rank">#</th><th className="st-name">Participante</th><th className="st-total">Total</th></tr>
                </thead>
                <tbody>
                  {leaderboard.map((r, i) => (
                    <tr key={r.user} className={`${r.user.toLowerCase() === user?.toLowerCase() ? "row-me" : ""} ${!r.confirmed ? "row-pending" : ""}`}>
                      <td className="st-rank">{r.confirmed ? i + 1 : "—"}</td>
                      <td className="st-name">
                        {r.user}
                        {r.user.toLowerCase() === user?.toLowerCase() ? <span className="me-badge"> (tú)</span> : ""}
                      </td>
                      <td className="st-total">{r.confirmed ? r.total : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="results-title" style={{ marginTop: 28 }}>Grupos simulados</h2>
            <div className="groups-standings-grid">
              {Object.entries(groupStandings).map(([letter, table]) => (
                <div className="group-standing-card" key={letter}>
                  <h3 className="group-standing-title">Grupo {letter}</h3>
                  <table className="standing-table">
                    <thead>
                      <tr>
                        <th className="st-pos">#</th><th className="st-name">Equipo</th>
                        <th>PJ</th><th>DG</th><th className="st-pts">Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.map((s, idx) => (
                        <tr key={s.name} className={idx < 2 ? "row-qualifier" : ""}>
                          <td className="st-pos">{idx + 1}</td>
                          <td className="st-name"><Flag name={s.name} />{s.name}</td>
                          <td>{s.played}</td>
                          <td className={s.gd > 0 ? "gd-pos" : s.gd < 0 ? "gd-neg" : ""}>{sign(s.gd)}</td>
                          <td className="st-pts">{s.pts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <h2 className="results-title" style={{ marginTop: 28 }}>
              Cuadro de eliminatorias
              {champion && <span className="qps-champion">🏆 {champion}</span>}
            </h2>
            <p className="muted" style={{ marginBottom: 12, fontSize: "0.82rem" }}>
              Los clasificados salen de tus grupos. Pon el marcador de cada cruce —los goles también puntúan en la porra. Si hay empate, elige quién pasa por penaltis.
            </p>
            <div className="qps-bracket">
              {ROUND_LABELS.map(([round, label]) => (
                <div key={round} className="qps-bracket-round">
                  <h3 className="qps-round-label">{label}</h3>
                  {bracketByRound[round].map((m) => {
                    const sc = m.score;
                    const isTie = !!sc && sc.h === sc.a;
                    return (
                      <div key={m.id} className={`qps-tie${m.ready ? "" : " qps-tie--tbd"}`}>
                        <div className="qps-tie-row">
                          <span className={`qps-side-name${m.winner === "home" ? " qps-side--win" : m.winner === "away" ? " qps-side--lose" : ""}`}>
                            {m.home !== "Por determinar" && <Flag name={m.home} />}
                            {m.home}
                          </span>
                          <div className="qps-ko-score">
                            <input
                              type="text" inputMode="numeric" maxLength={2}
                              value={sc ? String(sc.h) : ""}
                              placeholder="-" disabled={!m.ready}
                              onChange={(e) => setKoScore(m.id, "h", e.target.value)}
                              aria-label={`Goles ${m.home}`}
                            />
                            <span className="qps-dash">–</span>
                            <input
                              type="text" inputMode="numeric" maxLength={2}
                              value={sc ? String(sc.a) : ""}
                              placeholder="-" disabled={!m.ready}
                              onChange={(e) => setKoScore(m.id, "a", e.target.value)}
                              aria-label={`Goles ${m.away}`}
                            />
                          </div>
                          <span className={`qps-side-name qps-side-name--away${m.winner === "away" ? " qps-side--win" : m.winner === "home" ? " qps-side--lose" : ""}`}>
                            {m.away}
                            {m.away !== "Por determinar" && <Flag name={m.away} />}
                          </span>
                          {sc && (
                            <button className="qps-clear" onClick={() => clearKo(m.id)} title="Borrar marcador">×</button>
                          )}
                        </div>
                        {isTie && (
                          <div className="qps-pens">
                            <span className="qps-pens-label">Penaltis:</span>
                            <button
                              className={`qps-pen-btn${sc?.pen === "home" ? " qps-pen-btn--on" : ""}`}
                              onClick={() => setKoPen(m.id, "home")}
                            >{m.home}</button>
                            <button
                              className={`qps-pen-btn${sc?.pen === "away" ? " qps-pen-btn--on" : ""}`}
                              onClick={() => setKoPen(m.id, "away")}
                            >{m.away}</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

const ROUND_LABELS: [("R32" | "R16" | "QF" | "SF" | "FINAL"), string][] = [
  ["R32", "Dieciseisavos"],
  ["R16", "Octavos"],
  ["QF", "Cuartos"],
  ["SF", "Semifinales"],
  ["FINAL", "Final"],
];
