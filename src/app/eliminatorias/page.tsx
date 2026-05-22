"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getStoredUser, clearUser } from "@/lib/auth";

type MatchSlot = { label: string; isTbd?: boolean };
type BracketMatch = { home: MatchSlot; away: MatchSlot };
type Round = { id: string; label: string; dates: string; matches: BracketMatch[] };

function slot(label: string, isTbd = false): MatchSlot {
  return { label, isTbd };
}
const TBD = slot("Por determinar", true);

const ROUNDS: Round[] = [
  {
    id: "r32",
    label: "Dieciseisavos de final",
    dates: "4–8 jul 2026",
    matches: [
      { home: slot("1º Grupo A"), away: slot("2º Grupo B") },
      { home: slot("1º Grupo C"), away: slot("2º Grupo D") },
      { home: slot("1º Grupo B"), away: slot("2º Grupo A") },
      { home: slot("1º Grupo D"), away: slot("2º Grupo C") },
      { home: slot("1º Grupo E"), away: slot("2º Grupo F") },
      { home: slot("1º Grupo G"), away: slot("2º Grupo H") },
      { home: slot("1º Grupo F"), away: slot("2º Grupo E") },
      { home: slot("1º Grupo H"), away: slot("2º Grupo G") },
      { home: slot("1º Grupo I"), away: slot("2º Grupo J") },
      { home: slot("1º Grupo K"), away: slot("2º Grupo L") },
      { home: slot("1º Grupo J"), away: slot("2º Grupo I") },
      { home: slot("1º Grupo L"), away: slot("2º Grupo K") },
      { home: slot("Mejor 3er clasif."), away: slot("Mejor 3er clasif.") },
      { home: slot("Mejor 3er clasif."), away: slot("Mejor 3er clasif.") },
      { home: slot("Mejor 3er clasif."), away: slot("Mejor 3er clasif.") },
      { home: slot("Mejor 3er clasif."), away: slot("Mejor 3er clasif.") },
    ],
  },
  {
    id: "r16",
    label: "Octavos de final",
    dates: "10–14 jul 2026",
    matches: Array.from({ length: 8 }, () => ({ home: TBD, away: TBD })),
  },
  {
    id: "qf",
    label: "Cuartos de final",
    dates: "17–18 jul 2026",
    matches: Array.from({ length: 4 }, () => ({ home: TBD, away: TBD })),
  },
  {
    id: "sf",
    label: "Semifinales",
    dates: "21–22 jul 2026",
    matches: Array.from({ length: 2 }, () => ({ home: TBD, away: TBD })),
  },
  {
    id: "final",
    label: "Final",
    dates: "26 jul 2026 · MetLife Stadium",
    matches: [{ home: TBD, away: TBD }],
  },
];

function MatchCard({ match, highlight }: { match: BracketMatch; highlight?: boolean }) {
  return (
    <div className={`bracket-match${highlight ? " bracket-match--final" : ""}`}>
      <span className={match.home.isTbd ? "bracket-slot bracket-slot--tbd" : "bracket-slot"}>
        {match.home.label}
      </span>
      <span className="bracket-vs">vs</span>
      <span className={match.away.isTbd ? "bracket-slot bracket-slot--tbd" : "bracket-slot"}>
        {match.away.label}
      </span>
    </div>
  );
}

export default function EliminatoriasPage() {
  const router = useRouter();

  useEffect(() => {
    const user = getStoredUser();
    if (!user) router.push("/login");
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
          <span className="sub">Eliminatorias</span>
        </div>
        <nav className="topbar-nav">
          <Link href="/apuesta">Mi apuesta</Link>
          <Link href="/apuestas">Apuestas</Link>
          <Link href="/resultados">Resultados</Link>
          <Link href="/grupos">Grupos</Link>
        </nav>
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">26</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Mundial 2026 · Fase eliminatoria</div>
            <h2 className="hero-name">Cuadro de eliminatorias</h2>
            <p className="lead">
              Cruces de la segunda fase. Los clasificados se actualizarán al terminar la fase de grupos.
            </p>
          </div>
        </div>
      </section>

      <div className="content-area">
        <p className="api-notice" style={{ marginBottom: 32 }}>
          El Mundial arranca el 11 de junio. Hasta entonces, los cruces muestran las posiciones de grupo
          (1º, 2º) y los 8 mejores terceros clasificados que acceden a dieciseisavos.
        </p>

        {ROUNDS.map((round) => (
          <section key={round.id} className="bracket-round">
            <div className="bracket-round-header">
              <h3 className="bracket-round-title">{round.label}</h3>
              <span className="bracket-round-dates">{round.dates}</span>
            </div>
            <div className={`bracket-grid bracket-grid--${round.id}`}>
              {round.matches.map((match, i) => (
                <MatchCard
                  key={i}
                  match={match}
                  highlight={round.id === "final"}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
