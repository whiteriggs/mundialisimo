"use client";

import NavBar from "@/components/NavBar";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearUser } from "@/lib/auth";
import { fetchAllMatches, type ApiAllMatch } from "@/lib/football-api";
import { fetchUsersRest, fetchBetsRest, type BetDoc } from "@/lib/leaderboard";
import { getGroupId } from "@/lib/group";
import { computeStats, type StatsResult } from "@/lib/stats";

export default function EstadisticasPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

  const stats: StatsResult | null = useMemo(
    () => (loading ? null : computeStats(apiMatches, bets, users)),
    [loading, apiMatches, bets, users]
  );

  const uid = user?.toLowerCase();

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
          <span className="sub">Estadísticas</span>
        </div>
        <NavBar user={user} />
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">🏅</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Porra Mundial 2026 · Palmarés absurdo</div>
            <h2 className="hero-name">Estadísticas (de coña)</h2>
            <p className="lead">
              Los premios que nadie pidió pero todos merecéis. Medallas al mérito… y al desastre.
            </p>
          </div>
        </div>
      </section>

      {loading || !stats ? (
        <div className="loading-screen"><p className="muted">Cargando palmarés…</p></div>
      ) : stats.played === 0 ? (
        <div className="results-section">
          <p className="muted">Aún no se ha jugado nada. Los premios se reparten cuando ruede el balón.</p>
        </div>
      ) : (
        <div className="results-section">
          <div className="stats-grid">
            {stats.awards.map((a) => {
              const mine = !!a.winner && a.winner.toLowerCase() === uid;
              return (
                <div key={a.title} className={`stat-card${mine ? " stat-card--mine" : ""}${a.winner ? "" : " stat-card--empty"}`}>
                  <div className="stat-emoji">{a.emoji}</div>
                  <div className="stat-title">{a.title}</div>
                  <div className="stat-winner">
                    {a.winner ?? "Sin asignar"}
                    {mine && <span className="stat-you"> ¡tú!</span>}
                  </div>
                  <div className="stat-value">{a.value}</div>
                  <p className="stat-blurb">{a.blurb}</p>
                </div>
              );
            })}
          </div>
          <p className="muted prob-note">
            Calculado con los {stats.played} partidos ya jugados. Se actualiza solo conforme avanza el Mundial.
            Cualquier parecido con la realidad es pura estadística.
          </p>
        </div>
      )}
    </main>
  );
}
