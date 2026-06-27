"use client";

import NavBar from "@/components/NavBar";
import Flag from "@/components/Flag";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearUser } from "@/lib/auth";
import { fetchAllMatches, type ApiAllMatch } from "@/lib/football-api";
import { fetchUsersRest, fetchBetsRest, type BetDoc } from "@/lib/leaderboard";
import { getGroupId } from "@/lib/group";
import { computeWinProbabilities, type ProbabilityResult, type UserProbability } from "@/lib/winProbability";

// Formatea un % de forma legible: sin decimales si es alto, 1 decimal si es bajo.
const pct = (n: number) => (n >= 9.95 ? `${Math.round(n)}%` : n < 0.05 ? "0%" : `${n.toFixed(1)}%`);
const ordinal = (n: number) => `${n}.º`;

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
      setProb(computeWinProbabilities(apiMatches, bets, users));
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

          {/* ── Ficha detallada del participante en foco ──────────── */}
          {focus && (
            <div className="results-section">
              <h2 className="results-title">
                Ficha de {focus.user}
                {focus.user.toLowerCase() === uid ? " (tú)" : ""}
              </h2>

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
