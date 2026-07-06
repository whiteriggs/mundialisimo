"use client";

import NavBar from "@/components/NavBar";
import Flag from "@/components/Flag";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearUser } from "@/lib/auth";
import { fetchAllMatches, type ApiAllMatch } from "@/lib/football-api";
import { fetchUsersRest, fetchBetsRest, type BetDoc } from "@/lib/leaderboard";
import { getGroupId } from "@/lib/group";
import { computeWinProbabilities, conditionalWinPct, type ProbabilityResult, type UserProbability, type PendingMatchInfo } from "@/lib/winProbability";

// Formatea un % de forma legible: sin decimales si es alto, 1 decimal si es bajo.
const pct = (n: number) => (n >= 9.95 ? `${Math.round(n)}%` : n < 0.05 ? "0%" : `${n.toFixed(1)}%`);
const ordinal = (n: number) => `${n}.º`;

// Etiqueta de un desenlace de cruce (0 local, 1 local pen, 2 visit pen, 3 visit).
function outcomeLabel(m: PendingMatchInfo, code: number): string {
  switch (code) {
    case 0: return `Gana ${m.home}`;
    case 1: return `${m.home} pasa en penaltis`;
    case 2: return `${m.away} pasa en penaltis`;
    case 3: return `Gana ${m.away}`;
    default: return "";
  }
}

// Color de una barra de puesto: del dorado (1.º) al rojo (último).
function posColor(k: number, total: number): string {
  if (total <= 1) return "var(--gold)";
  const t = k / (total - 1); // 0 = primero, 1 = último
  const hue = 45 - t * 45; // 45 (dorado) → 0 (rojo)
  return `hsl(${hue}, 75%, 55%)`;
}

export default function ProbabilidadesPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calc, setCalc] = useState<"idle" | "running" | "done">("idle");
  const [prob, setProb] = useState<ProbabilityResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Explorador interactivo: desenlace elegido por cruce (key → code 0..3).
  const [scenSel, setScenSel] = useState<Record<string, number>>({});

  const [apiMatches, setApiMatches] = useState<ApiAllMatch[]>([]);
  const [bets, setBets] = useState<BetDoc[]>([]);
  const [users, setUsers] = useState<string[]>([]);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.push("/login"); return; }
    setUser(u);
    Promise.all([
      fetchAllMatches().catch(() => [] as ApiAllMatch[]),
      fetchUsersRest(getGroupId()),
      fetchBetsRest(getGroupId()),
    ])
      .then(([m, us, bs]) => {
        setApiMatches(m);
        setUsers(us);
        setBets(bs);
      })
      .finally(() => setLoading(false));
  }, [router]);

  // Lanza el Monte Carlo automáticamente al tener los datos. Se difiere un
  // instante para que el "Calculando…" se pinte antes de bloquear ~1s.
  useEffect(() => {
    if (loading) return;
    setCalc("running");
    const id = setTimeout(() => {
      setProb(computeWinProbabilities(apiMatches, bets, users, 8000));
      setCalc("done");
    }, 40);
    return () => clearTimeout(id);
  }, [loading, apiMatches, bets, users]);

  const uid = user?.toLowerCase();

  // Participante en foco para la ficha detallada (por defecto, tú).
  const focus: UserProbability | null = useMemo(() => {
    if (!prob || prob.users.length === 0) return null;
    const sel = selected ?? user ?? "";
    return prob.users.find((u) => u.user.toLowerCase() === sel.toLowerCase()) ?? prob.users[0];
  }, [prob, selected, user]);

  // Aspirantes reales: quienes tienen alguna opción (winPct ≥ 1%). Son las
  // columnas de las tablas de escenarios. Si casi nadie destaca, top 4.
  const contenders = useMemo(() => {
    if (!prob) return [] as UserProbability[];
    const real = prob.users.filter((u) => u.winPct >= 1);
    return (real.length >= 2 ? real : prob.users).slice(0, 4);
  }, [prob]);

  // Índice de cada jugador en el orden de scenarioSims (para leer los winPct).
  const playerIndex = useMemo(() => {
    const map: Record<string, number> = {};
    prob?.scenarioSims.players.forEach((u, i) => (map[u] = i));
    return map;
  }, [prob]);

  // Resultado del explorador interactivo según los desenlaces elegidos.
  const scenResult = useMemo(() => {
    if (!prob) return null;
    return conditionalWinPct(prob.scenarioSims, scenSel);
  }, [prob, scenSel]);

  function handleLogout() {
    clearUser();
    router.push("/login");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialisimo</h1>
          <span className="sub">Probabilidades</span>
        </div>
        <NavBar user={user} />
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">🎲</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Porra Mundial 2026</div>
            <h2 className="hero-name">Probabilidades de ganar</h2>
            <p className="lead">
              Jugamos el Mundial miles de veces en el ordenador y miramos cuántas veces gana cada uno.
            </p>
          </div>
        </div>
      </section>

      {loading || calc !== "done" || !prob ? (
        <div className="loading-screen">
          <p className="muted">{loading ? "Cargando datos…" : "Calculando probabilidades…"}</p>
        </div>
      ) : prob.users.length === 0 ? (
        <div className="results-section">
          <p className="muted">Aún no hay participantes con la apuesta confirmada.</p>
        </div>
      ) : (
        <>
          {/* ── Cómo funciona ──────────────────────────────────── */}
          <div className="results-section">
            <div className="prob-explainer">
              <h3>¿Cómo se calcula esto?</h3>
              <p>
                Simulamos el resto del Mundial <strong>{prob.sims.toLocaleString("es-ES")} veces</strong>.
                En cada simulación se juegan los partidos que faltan (la probabilidad de cada resultado
                depende de la fuerza de cada selección, que parte del ranking mundial y se ajusta con lo
                que ya ha pasado en el torneo), se resuelven todos los cruces de la eliminatoria y se
                puntúa la porra de todos a la vez. Repetido miles de veces, sale con qué frecuencia gana
                cada uno, queda en el podio o se va al farolillo. Es una <strong>estimación</strong>, no
                una predicción exacta.
              </p>
            </div>
          </div>

          {/* ── Tabla principal ────────────────────────────────── */}
          <div className="results-section">
            <h2 className="results-title">Clasificación por probabilidad</h2>
            <p className="muted prob-help">Toca un participante para ver su ficha detallada más abajo.</p>
            <div className="standings-wrap">
              <table className="standings-table prob-table">
                <thead>
                  <tr>
                    <th className="st-rank">#</th>
                    <th className="st-name">Participante</th>
                    <th className="prob-col" title="Cuántas veces queda 1.º en las simulaciones">Gana 🏆</th>
                    <th className="prob-col" title="Cuántas veces queda entre los 3 primeros">Podio 🥉</th>
                    <th className="prob-col" title="Cuántas veces queda último">Farolillo 🥄</th>
                    <th className="prob-col" title="Puntuación final media y rango habitual (del 10% peor al 10% mejor)">Puntos</th>
                    <th className="prob-col" title="Favoritos (▲) y antifavoritos (▼) que aún no están eliminados">Vivos</th>
                  </tr>
                </thead>
                <tbody>
                  {prob.users.map((u, i) => {
                    const isMe = u.user.toLowerCase() === uid;
                    const isFocus = focus?.user === u.user;
                    return (
                      <tr
                        key={u.user}
                        onClick={() => setSelected(u.user)}
                        className={`prob-row${isMe ? " row-me" : ""}${isFocus ? " prob-row-focus" : ""}`}
                      >
                        <td className="st-rank">{i + 1}</td>
                        <td className="st-name">
                          {u.user}
                          {isMe ? <span className="me-badge"> (tú)</span> : ""}
                        </td>
                        <td className="prob-col prob-win">{pct(u.winPct)}</td>
                        <td className="prob-col">{pct(u.podiumPct)}</td>
                        <td className="prob-col">{pct(u.lastPct)}</td>
                        <td className="prob-col">
                          <span className="prob-mean">{Math.round(u.meanScore)}</span>
                          <span className="prob-range">{Math.round(u.p10)}–{Math.round(u.p90)}</span>
                        </td>
                        <td className="prob-col prob-alive">
                          <span className="prob-fav" title="Favoritos vivos">▲{u.aliveFav}/{u.totalFav}</span>
                          <span className="prob-anti" title="Antifavoritos vivos">▼{u.aliveAnti}/{u.totalAnti}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Partidos que deciden la porra (escenarios automáticos) ── */}
          {prob.scenarios.length > 0 && contenders.length > 0 && (
            <div className="results-section">
              <h2 className="results-title">Partidos que deciden la porra</h2>
              <p className="muted prob-help">
                Para cada cruce pendiente, cómo cambia la probabilidad de ganar la porra según el desenlace.
                Pasar por penaltis puntúa como <strong>empate</strong> (sin el bonus de victoria), así que no es lo
                mismo ganar en los 90'/prórroga que en la tanda. Ordenados por lo decisivos que son.
              </p>
              <div className="scen-grid">
                {prob.scenarios.map((sc) => (
                  <div key={sc.match.key} className={`scen-card${sc.swing >= 10 ? " scen-card--key" : ""}`}>
                    <div className="scen-head">
                      <span className="scen-teams">
                        <Flag name={sc.match.home} />{sc.match.home}
                        <span className="scen-vs">vs</span>
                        {sc.match.away}<Flag name={sc.match.away} />
                      </span>
                      <span className="scen-round">{sc.match.round}</span>
                    </div>
                    <table className="scen-table">
                      <thead>
                        <tr>
                          <th className="scen-outcome">Desenlace</th>
                          <th className="scen-p" title="Probabilidad de que ocurra">Prob.</th>
                          {contenders.map((c) => (
                            <th key={c.user} className="scen-u">{c.user}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sc.outcomes.map((o) => {
                          const best = Math.max(...contenders.map((c) => o.winPct[playerIndex[c.user]] ?? 0));
                          return (
                            <tr key={o.code} className={o.prob < 1 ? "scen-rare" : ""}>
                              <td className="scen-outcome">{outcomeLabel(sc.match, o.code)}</td>
                              <td className="scen-p">{pct(o.prob)}</td>
                              {contenders.map((c) => {
                                const v = o.winPct[playerIndex[c.user]] ?? 0;
                                return (
                                  <td key={c.user} className={`scen-u${v === best && o.prob >= 1 ? " scen-u-lead" : ""}`}>
                                    {pct(v)}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Explorador interactivo de escenarios ──────────────── */}
          {prob.scenarios.length > 0 && contenders.length > 0 && (
            <div className="results-section">
              <h2 className="results-title">Explorador de escenarios</h2>
              <p className="muted prob-help">
                Elige un desenlace para uno o varios cruces y mira las probabilidades condicionadas a que pase eso.
              </p>
              <div className="scen-explorer">
                <div className="scen-selects">
                  {prob.pending.map((m) => (
                    <label key={m.key} className="scen-select">
                      <span className="scen-select-lbl">
                        <Flag name={m.home} />{m.home} <span className="scen-vs">vs</span> {m.away}<Flag name={m.away} />
                      </span>
                      <select
                        value={scenSel[m.key] ?? ""}
                        onChange={(e) =>
                          setScenSel((prev) => {
                            const next = { ...prev };
                            if (e.target.value === "") delete next[m.key];
                            else next[m.key] = Number(e.target.value);
                            return next;
                          })
                        }
                      >
                        <option value="">Cualquiera</option>
                        <option value="0">Gana {m.home}</option>
                        <option value="1">{m.home} por penaltis</option>
                        <option value="2">{m.away} por penaltis</option>
                        <option value="3">Gana {m.away}</option>
                      </select>
                    </label>
                  ))}
                </div>
                <div className="scen-out">
                  {Object.keys(scenSel).length === 0 ? (
                    <p className="muted">Sin condiciones aún: esto es la probabilidad base. Elige algún desenlace.</p>
                  ) : scenResult && scenResult.sample < 40 ? (
                    <p className="muted scen-warn">Solo {scenResult.sample} simulaciones cumplen esa combinación → resultado poco fiable.</p>
                  ) : null}
                  {scenResult && (
                    <table className="scen-cond-table">
                      <tbody>
                        {contenders.map((c) => (
                          <tr key={c.user} className={c.user.toLowerCase() === uid ? "row-me" : ""}>
                            <td className="scen-cond-name">{c.user}{c.user.toLowerCase() === uid ? " (tú)" : ""}</td>
                            <td className="scen-cond-val">{pct(scenResult.pct[playerIndex[c.user]] ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {Object.keys(scenSel).length > 0 && scenResult && (
                    <div className="scen-actions">
                      <span className="muted">{scenResult.sample.toLocaleString("es-ES")} de {prob.sims.toLocaleString("es-ES")} simulaciones</span>
                      <button className="mini-action" onClick={() => setScenSel({})}>Limpiar</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Ficha detallada del participante en foco ──────────── */}
          {focus && (
            <div className="results-section">
              <h2 className="results-title">
                Ficha de {focus.user}
                {focus.user.toLowerCase() === uid ? " (tú)" : ""}
              </h2>

              {/* Balance esperado: cuánto suman los favoritos y restan los antis */}
              <div className="prob-balance">
                <div className="prob-bal-item prob-bal-fav">
                  <span className="prob-bal-label">Tus favoritos suman</span>
                  <span className="prob-bal-val">+{Math.round(focus.favPts)}</span>
                </div>
                <div className="prob-bal-item prob-bal-anti">
                  <span className="prob-bal-label">Tus antifavoritos restan</span>
                  <span className="prob-bal-val">−{Math.round(focus.antiPts)}</span>
                </div>
                <div className="prob-bal-item prob-bal-net">
                  <span className="prob-bal-label">Puntos esperados (neto)</span>
                  <span className="prob-bal-val">{Math.round(focus.favPts - focus.antiPts)}</span>
                </div>
              </div>
              <p className="muted prob-help">
                De media, los puntos que te aportan tus favoritos menos los que te restan tus antifavoritos.
                Por eso puedes ir líder aunque tengas varios antis clasificados: si tus favoritos son fuertes,
                lo que suman supera de sobra lo que restan los antis (sobre todo si son selecciones flojas).
              </p>

              <div className="prob-cards">
                <div className="prob-card">
                  <div className="prob-card-label">Su jugador más rentable</div>
                  {focus.mvp ? (
                    <div className="prob-card-team">
                      <Flag name={focus.mvp.team} />
                      <span>{focus.mvp.team}</span>
                      <span className="prob-card-pts prob-card-good">≈ +{Math.round(focus.mvp.pts)} pts</span>
                    </div>
                  ) : <span className="muted">—</span>}
                  <div className="prob-card-foot">El favorito que más puntos le suma de media.</div>
                </div>

                <div className="prob-card">
                  <div className="prob-card-label">Su mayor lastre</div>
                  {focus.lastre ? (
                    <div className="prob-card-team">
                      <Flag name={focus.lastre.team} />
                      <span>{focus.lastre.team}</span>
                      <span className="prob-card-pts prob-card-bad">≈ −{Math.round(focus.lastre.pts)} pts</span>
                    </div>
                  ) : <span className="muted">—</span>}
                  <div className="prob-card-foot">El antifavorito que más puntos le resta de media.</div>
                </div>
              </div>

              {/* Distribución de puesto final */}
              <div className="prob-block">
                <div className="prob-block-head">
                  <h3>¿En qué puesto suele quedar?</h3>
                  <span className="prob-best">Más probable: <strong>{ordinal(focus.bestPos)}</strong></span>
                </div>
                <p className="muted prob-help">
                  Cada tramo es la probabilidad de acabar en ese puesto. A más dorado, mejor puesto.
                </p>
                <div className="prob-posbar">
                  {focus.posDist.map((p, k) =>
                    p < 0.4 ? null : (
                      <div
                        key={k}
                        className="prob-posseg"
                        style={{ width: `${p}%`, background: posColor(k, focus.posDist.length) }}
                        title={`${ordinal(k + 1)} puesto: ${pct(p)}`}
                      >
                        {p >= 8 ? <span>{ordinal(k + 1)}</span> : null}
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Cara a cara */}
              <div className="prob-block">
                <h3>¿A quién le gana?</h3>
                <p className="muted prob-help">
                  Probabilidad de terminar por <strong>encima</strong> de cada rival en la clasificación final.
                </p>
                <div className="prob-h2h">
                  {focus.beats.map((b) => (
                    <div key={b.user} className="prob-h2h-row" onClick={() => setSelected(b.user)}>
                      <span className="prob-h2h-name">{b.user}</span>
                      <div className="prob-h2h-bar">
                        <div
                          className={`prob-h2h-fill ${b.pct >= 50 ? "win" : "lose"}`}
                          style={{ width: `${Math.max(2, b.pct)}%` }}
                        />
                      </div>
                      <span className={`prob-h2h-pct ${b.pct >= 50 ? "win" : "lose"}`}>{pct(b.pct)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Probabilidades por selección ──────────────────────── */}
          {prob.teams.length > 0 && (
            <div className="results-section">
              <h2 className="results-title">¿Quién levantará la copa?</h2>
              <p className="muted prob-help">
                Probabilidad de cada selección de ser campeona, llegar a la final o a semifinales, según las mismas simulaciones.
              </p>
              <div className="standings-wrap">
                <table className="standings-table prob-table">
                  <thead>
                    <tr>
                      <th className="st-rank">#</th>
                      <th className="st-name">Selección</th>
                      <th className="prob-col">Campeón</th>
                      <th className="prob-col">Final</th>
                      <th className="prob-col">Semis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prob.teams.filter((t) => t.semiPct >= 0.5).slice(0, 16).map((t, i) => (
                      <tr key={t.team}>
                        <td className="st-rank">{i + 1}</td>
                        <td className="st-name prob-teamcell">
                          <Flag name={t.team} />
                          <span>{t.team}</span>
                        </td>
                        <td className="prob-col prob-win">{pct(t.championPct)}</td>
                        <td className="prob-col">{pct(t.finalPct)}</td>
                        <td className="prob-col">{pct(t.semiPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Leyenda ───────────────────────────────────────────── */}
          <div className="results-section">
            <div className="prob-legend">
              <h3>Qué significa cada cosa</h3>
              <ul>
                <li><strong>Gana 🏆</strong>: probabilidad de terminar 1.º de la porra.</li>
                <li><strong>Podio 🥉</strong>: probabilidad de quedar entre los tres primeros.</li>
                <li><strong>Farolillo 🥄</strong>: probabilidad de quedar último.</li>
                <li><strong>Puntos</strong>: puntuación final media. El número pequeño es el rango habitual (del 10% de escenarios peores al 10% mejores): cuanto más ancho, más en el aire está tu resultado.</li>
                <li><strong>Vivos ▲/▼</strong>: cuántos de tus favoritos (▲) y antifavoritos (▼) siguen sin estar eliminados. Un antifavorito vivo y fuerte es malo para ti: cuanto más avanza, más puntos te resta.</li>
                <li><strong>Jugador más rentable / mayor lastre</strong>: el equipo que más te suma (un favorito) y el que más te resta (un antifavorito), de media.</li>
              </ul>
              <p className="muted prob-note">
                Basado en {prob.sims.toLocaleString("es-ES")} simulaciones. La fuerza de cada selección es una
                estimación a partir del ranking mundial, ajustada con los resultados ya jugados. Las cifras se
                actualizan solas conforme entran resultados nuevos.
              </p>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
