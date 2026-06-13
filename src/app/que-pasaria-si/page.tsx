"use client";

import NavBar from "@/components/NavBar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearUser } from "@/lib/auth";
import { fetchAllMatches, type ApiAllMatch } from "@/lib/football-api";
import { fetchUsersRest, fetchBetsRest, type BetDoc } from "@/lib/leaderboard";
import { fetchPredictions, savePredictions, type Predictions } from "@/lib/predictions";
import { buildTeamTotals, calcUserScore, type Match } from "@/lib/scoring";
import { buildGroupStandings } from "@/lib/standings";
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.push("/login"); return; }
    setUser(u);
    Promise.all([
      fetchAllMatches().catch(() => [] as ApiAllMatch[]),
      fetchUsersRest(getGroupId()),
      fetchBetsRest(getGroupId()),
      fetchPredictions(u),
    ])
      .then(([m, us, bs, preds]) => {
        setApiMatches(m);
        setUsers(us);
        setBets(bs);
        setPredictions(preds);
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

  // Conjunto de partidos para el cálculo: el resultado REAL siempre manda; el
  // pronóstico solo cuenta en partidos aún no jugados.
  const simulatedMatches = useMemo<Match[]>(() => {
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

  const teamTotals = useMemo(() => buildTeamTotals(simulatedMatches), [simulatedMatches]);

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

  const groupStandings = useMemo(() => buildGroupStandings(simulatedMatches), [simulatedMatches]);

  // Autosave con debounce.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((next: Predictions) => {
    if (!user) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      savePredictions(user, next)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("idle"));
    }, 700);
  }, [user]);

  function setScore(matchId: string, side: "h" | "a", value: string) {
    const n = Math.max(0, Math.min(30, Number(value.replace(/[^0-9]/g, "")) || 0));
    setPredictions((prev) => {
      const cur = prev[matchId] ?? { h: 0, a: 0 };
      const next = { ...prev, [matchId]: { ...cur, [side]: n } };
      persist(next);
      return next;
    });
  }

  function clearPrediction(matchId: string) {
    setPredictions((prev) => {
      const next = { ...prev };
      delete next[matchId];
      persist(next);
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
          <section className="results-section">
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
          </section>
        </div>
      )}
    </main>
  );
}
