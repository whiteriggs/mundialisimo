"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getStoredUser, clearUser, USERS } from "@/lib/auth";
import { teamName } from "@/lib/teams";
import { buildTeamTotals, Phase, Match } from "@/lib/scoring";
import { fetchFinishedMatches } from "@/lib/football-api";

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

export default function ResultadosPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [bets, setBets] = useState<BetDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { router.push("/login"); return; }
    setCurrentUser(user);

    async function load() {
      try {
        const [apiMatches, betSnap] = await Promise.all([
          fetchFinishedMatches().catch((err) => {
            setApiError(err.message);
            return [] as Match[];
          }),
          getDocs(collection(db, "bets")),
        ]);

        const sorted = [...apiMatches].sort((a, b) => {
          const order: Phase[] = ["groups", "third", "knockout"];
          return order.indexOf(a.phase) - order.indexOf(b.phase);
        });
        setMatches(sorted);

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

  const teamTotals = buildTeamTotals(matches);

  const rankings = USERS.map((u) => {
    const uid = u.toLowerCase();
    const bet = bets.find((b) => b.user === uid);
    const favPts = bet?.confirmed
      ? (bet.favorites ?? []).reduce((s, id) => s + (teamTotals[teamName(id)] ?? 0), 0)
      : 0;
    const antiPts = bet?.confirmed
      ? (bet.antiFavorites ?? []).reduce((s, id) => s + (teamTotals[teamName(id)] ?? 0), 0)
      : 0;
    return { user: u, uid, total: favPts - antiPts, favPts, antiPts, confirmed: bet?.confirmed ?? false };
  }).sort((a, b) => b.total - a.total);

  function handleLogout() {
    clearUser();
    router.push("/login");
  }

  const playedMatches = matches.filter((m) => m.played);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialisimo</h1>
          <span className="sub">Resultados</span>
        </div>
        <nav className="topbar-nav">
          <Link href="/apuesta">Mi apuesta</Link>
          <Link href="/grupos">Grupos</Link>
          <Link href="/apuestas">Apuestas</Link>
        </nav>
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">26</div>
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
              <p className="login-error">Error API: {apiError}</p>
            </div>
          )}

          {/* Rankings */}
          <div className="results-section">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Participante</th>
                  <th>Puntos</th>
                  <th className="col-detail">Favoritos</th>
                  <th className="col-detail">Antifav.</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r, i) => (
                  <tr
                    key={r.uid}
                    className={`${r.uid === currentUser?.toLowerCase() ? "row-me" : ""} ${!r.confirmed ? "row-pending" : ""}`}
                  >
                    <td className="col-rank">{r.confirmed ? i + 1 : "—"}</td>
                    <td>
                      {r.user}
                      {r.uid === currentUser?.toLowerCase() ? <span className="me-badge"> (tú)</span> : ""}
                      {!r.confirmed ? <span className="pending-label"> · sin confirmar</span> : ""}
                    </td>
                    <td className="col-pts">{r.confirmed ? r.total : "—"}</td>
                    <td className="col-detail">{r.confirmed ? `+${r.favPts}` : "—"}</td>
                    <td className="col-detail">{r.confirmed ? `−${r.antiPts}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Match list */}
          {playedMatches.length > 0 && (
            <div className="results-section">
              <h2 className="results-title">Partidos jugados</h2>
              <div className="matches-list">
                {(["groups", "third", "knockout"] as Phase[]).map((phase) => {
                  const group = playedMatches.filter((m) => m.phase === phase);
                  if (group.length === 0) return null;
                  return (
                    <div key={phase}>
                      <h3 className="matches-phase-label">{PHASE_LABELS[phase]}</h3>
                      {group.map((m) => (
                        <div className="match-row" key={m.id}>
                          <span className="match-home">{m.home}</span>
                          <span className="match-score">
                            {m.homeGoals} – {m.awayGoals}
                            {m.penalties && <span className="pens-badge">pen.</span>}
                          </span>
                          <span className="match-away">{m.away}</span>
                          <span />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
