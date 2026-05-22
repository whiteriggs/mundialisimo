"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearUser } from "@/lib/auth";
import { fetchGroupStandings, ApiStandingGroup, toInternalName } from "@/lib/football-api";

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
  const [groups, setGroups] = useState<ApiStandingGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState(0);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { router.push("/login"); return; }

    fetchGroupStandings()
      .then((data) => {
        setGroups(data);
        const played = data.reduce(
          (sum, g) => sum + (g.table[0]?.playedGames ?? 0),
          0
        );
        setMatchCount(played);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

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
          <span className="sub">Grupos</span>
        </div>
        <nav className="topbar-nav">
          <Link href="/apuesta">Mi apuesta</Link>
          <Link href="/apuestas">Apuestas</Link>
          <Link href="/resultados">Resultados</Link>
        </nav>
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">26</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Mundial 2026 · Fase de grupos</div>
            <h2 className="hero-name">Clasificación de grupos</h2>
            <p className="lead">
              {matchCount === 0
                ? "El Mundial empieza el 11 de junio. Los datos se actualizan automáticamente desde football-data.org."
                : `${matchCount} partido${matchCount !== 1 ? "s" : ""} de grupo jugado${matchCount !== 1 ? "s" : ""}.`}
            </p>
          </div>
        </div>
      </section>

      {loading && <div className="loading-screen"><p className="muted">Cargando datos oficiales…</p></div>}
      {error && (
        <div className="results-section">
          <p className="login-error">Error al cargar: {error}</p>
          <p className="muted">Comprueba que la API key está configurada y que el torneo ya tiene datos en football-data.org.</p>
        </div>
      )}
      {!loading && !error && (
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
                        <td className="st-name">{toInternalName(row.team.name)}</td>
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
    </main>
  );
}
