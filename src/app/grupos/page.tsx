"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getStoredUser, clearUser } from "@/lib/auth";
import { Match, Phase } from "@/lib/scoring";
import { buildGroupStandings, TeamStanding } from "@/lib/standings";
import { GROUP_POOL } from "@/lib/teams";

const GROUP_LABELS = Object.keys(GROUP_POOL);

function sign(n: number) {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${n}`;
  return "0";
}

export default function GruposPage() {
  const router = useRouter();
  const [standings, setStandings] = useState<Record<string, TeamStanding[]>>({});
  const [loading, setLoading] = useState(true);
  const [matchCount, setMatchCount] = useState(0);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { router.push("/login"); return; }

    async function load() {
      try {
        const snap = await getDocs(collection(db, "matches"));
        const matches: Match[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Match, "id">),
        }));
        const groupMatches = matches.filter((m) => m.phase === "groups" && m.played);
        setMatchCount(groupMatches.length);
        setStandings(buildGroupStandings(matches));
      } finally {
        setLoading(false);
      }
    }
    load();
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
                ? "El Mundial empieza el 11 de junio. La tabla se actualiza con los partidos que vayáis añadiendo en Resultados."
                : `${matchCount} partido${matchCount !== 1 ? "s" : ""} de grupo jugado${matchCount !== 1 ? "s" : ""}.`}
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="loading-screen"><p className="muted">Cargando…</p></div>
      ) : (
        <div className="groups-standings-grid">
          {GROUP_LABELS.map((group) => {
            const rows = standings[group] ?? [];
            return (
              <div className="group-standing-card" key={group}>
                <h3 className="group-standing-title">Grupo {group}</h3>
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
                    {rows.map((team, idx) => (
                      <tr
                        key={team.name}
                        className={idx < 2 ? "row-qualifier" : ""}
                      >
                        <td className="st-pos">{idx + 1}</td>
                        <td className="st-name">{team.name}</td>
                        <td>{team.played}</td>
                        <td>{team.won}</td>
                        <td>{team.drawn}</td>
                        <td>{team.lost}</td>
                        <td>{team.gf}</td>
                        <td>{team.ga}</td>
                        <td className={team.gd > 0 ? "gd-pos" : team.gd < 0 ? "gd-neg" : ""}>
                          {sign(team.gd)}
                        </td>
                        <td className="st-pts">{team.pts}</td>
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
