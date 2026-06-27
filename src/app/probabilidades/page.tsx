"use client";

import NavBar from "@/components/NavBar";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearUser } from "@/lib/auth";
import { fetchAllMatches, type ApiAllMatch } from "@/lib/football-api";
import { fetchUsersRest, fetchBetsRest, type BetDoc } from "@/lib/leaderboard";
import { getGroupId } from "@/lib/group";
import { computeWinProbabilities, type ProbabilityResult } from "@/lib/winProbability";

const pct = (n: number) => (n >= 9.95 ? Math.round(n) : n.toFixed(1));

export default function ProbabilidadesPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calc, setCalc] = useState<"idle" | "running" | "done">("idle");
  const [prob, setProb] = useState<ProbabilityResult | null>(null);

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

  // Lanza el Monte Carlo automáticamente cuando los datos están listos. Se
  // difiere un instante para que el "Calculando…" se pinte antes de bloquear.
  useEffect(() => {
    if (loading) return;
    setCalc("running");
    const id = setTimeout(() => {
      const r = computeWinProbabilities(apiMatches, bets, users);
      setProb(r);
      setCalc("done");
    }, 40);
    return () => clearTimeout(id);
  }, [loading, apiMatches, bets, users]);

  function handleLogout() {
    clearUser();
    router.push("/login");
  }

  const uid = user?.toLowerCase();

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
              Simulamos miles de veces cómo podría terminar el torneo y contamos cuántas
              veces gana cada uno. Tiene en cuenta los equipos clasificados, los cruces y
              qué favoritos y antifavoritos le quedan vivos a cada participante.
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
        <div className="results-section">
          <div className="standings-wrap">
            <table className="standings-table prob-table">
              <thead>
                <tr>
                  <th className="st-rank">#</th>
                  <th className="st-name">Participante</th>
                  <th className="prob-col" title="Probabilidad de ganar la porra">Ganar</th>
                  <th className="prob-col" title="Probabilidad de quedar entre los 3 primeros">Podio</th>
                  <th className="prob-col" title="Probabilidad de quedar último">Farolillo</th>
                  <th className="prob-col" title="Puntuación final media esperada">Pts medios</th>
                  <th className="prob-col" title="Favoritos / antifavoritos aún no eliminados">Vivos</th>
                </tr>
              </thead>
              <tbody>
                {prob.users.map((u, i) => (
                  <tr key={u.user} className={u.user.toLowerCase() === uid ? "row-me" : ""}>
                    <td className="st-rank">{i + 1}</td>
                    <td className="st-name">
                      {u.user}
                      {u.user.toLowerCase() === uid ? <span className="me-badge"> (tú)</span> : ""}
                    </td>
                    <td className="prob-col prob-win">{pct(u.winPct)}%</td>
                    <td className="prob-col">{pct(u.podiumPct)}%</td>
                    <td className="prob-col">{pct(u.lastPct)}%</td>
                    <td className="prob-col">{Math.round(u.meanScore)}</td>
                    <td className="prob-col prob-alive">
                      <span className="prob-fav" title="Favoritos vivos">▲ {u.aliveFav}/{u.totalFav}</span>
                      <span className="prob-anti" title="Antifavoritos vivos">▼ {u.aliveAnti}/{u.totalAnti}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted prob-note">
            Basado en {prob.sims.toLocaleString("es-ES")} simulaciones del torneo. La fuerza de cada
            selección parte del ranking mundial aproximado y se ajusta con los resultados ya jugados.
            Es una estimación orientativa, no una predicción exacta.
          </p>
        </div>
      )}
    </main>
  );
}
