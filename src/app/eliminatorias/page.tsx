"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getStoredUser, clearUser } from "@/lib/auth";

type MatchSlot = { label: string; isTbd?: boolean };
type BracketMatch = { home: MatchSlot; away: MatchSlot; date?: string; venue?: string };
type Round = { id: string; label: string; dates: string; matches: BracketMatch[] };

function slot(label: string, isTbd = false): MatchSlot {
  return { label, isTbd };
}
const TBD = slot("Por determinar", true);

// Cruces oficiales — fuente: marca.com/futbol/mundial/calendario/cuadro-final.html
const ROUNDS: Round[] = [
  {
    id: "r32",
    label: "Dieciseisavos de final",
    dates: "28 jun – 4 jul 2026",
    matches: [
      { home: slot("2º Grupo A"),               away: slot("2º Grupo B"),               date: "28 jun", venue: "SoFi Stadium, Los Ángeles" },
      { home: slot("1º Grupo C"),               away: slot("2º Grupo F"),               date: "29 jun", venue: "NRG Stadium, Houston" },
      { home: slot("1º Grupo E"),               away: slot("Mejor 3º (A/B/C/D/F)"),    date: "29 jun", venue: "Gillette Stadium, Boston" },
      { home: slot("1º Grupo F"),               away: slot("2º Grupo C"),               date: "30 jun", venue: "Est. BBVA, Guadalupe" },
      { home: slot("2º Grupo E"),               away: slot("2º Grupo I"),               date: "30 jun", venue: "AT&T Stadium, Dallas" },
      { home: slot("1º Grupo I"),               away: slot("Mejor 3º (C/D/F/G/H)"),    date: "30 jun", venue: "MetLife Stadium, Nueva York" },
      { home: slot("1º Grupo A"),               away: slot("Mejor 3º (C/E/F/H/I)"),    date: "1 jul",  venue: "Est. Banorte, Ciudad de México" },
      { home: slot("1º Grupo L"),               away: slot("Mejor 3º (E/H/I/J/K)"),    date: "1 jul",  venue: "Mercedes-Benz Stadium, Atlanta" },
      { home: slot("1º Grupo G"),               away: slot("Mejor 3º (A/E/H/I/J)"),    date: "1 jul",  venue: "Lumen Field, Seattle" },
      { home: slot("1º Grupo D"),               away: slot("Mejor 3º (B/E/F/I/J)"),    date: "2 jul",  venue: "Levi's Stadium, San Francisco" },
      { home: slot("1º Grupo H"),               away: slot("2º Grupo J"),               date: "2 jul",  venue: "SoFi Stadium, Los Ángeles" },
      { home: slot("2º Grupo K"),               away: slot("2º Grupo L"),               date: "3 jul",  venue: "BMO Field, Toronto" },
      { home: slot("1º Grupo B"),               away: slot("Mejor 3º (E/F/G/I/J)"),    date: "3 jul",  venue: "BC Place, Vancouver" },
      { home: slot("2º Grupo D"),               away: slot("2º Grupo G"),               date: "3 jul",  venue: "AT&T Stadium, Dallas" },
      { home: slot("1º Grupo J"),               away: slot("2º Grupo H"),               date: "3 jul",  venue: "Hard Rock Stadium, Miami" },
      { home: slot("1º Grupo K"),               away: slot("Mejor 3º (D/E/I/J/L)"),    date: "4 jul",  venue: "Arrowhead Stadium, Kansas City" },
    ],
  },
  {
    id: "r16",
    label: "Octavos de final",
    dates: "4–7 jul 2026",
    matches: Array.from({ length: 8 }, () => ({ home: TBD, away: TBD })),
  },
  {
    id: "qf",
    label: "Cuartos de final",
    dates: "9–12 jul 2026",
    matches: Array.from({ length: 4 }, () => ({ home: TBD, away: TBD })),
  },
  {
    id: "sf",
    label: "Semifinales",
    dates: "14–15 jul 2026",
    matches: Array.from({ length: 2 }, () => ({ home: TBD, away: TBD })),
  },
  {
    id: "final",
    label: "Final",
    dates: "19 jul 2026 · MetLife Stadium, Nueva York",
    matches: [{ home: TBD, away: TBD }],
  },
];

function MatchCard({ match, highlight }: { match: BracketMatch; highlight?: boolean }) {
  return (
    <div className={`bracket-match${highlight ? " bracket-match--final" : ""}`}>
      <div className="bracket-match-teams">
        <span className={match.home.isTbd ? "bracket-slot bracket-slot--tbd" : "bracket-slot"}>
          {match.home.label}
        </span>
        <span className="bracket-vs">vs</span>
        <span className={match.away.isTbd ? "bracket-slot bracket-slot--tbd" : "bracket-slot"}>
          {match.away.label}
        </span>
      </div>
      {(match.date || match.venue) && (
        <div className="bracket-match-meta">
          {match.date && <span>{match.date}</span>}
          {match.venue && <span>{match.venue}</span>}
        </div>
      )}
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
              Cruces oficiales de la segunda fase. Los clasificados se conocerán al terminar los grupos (2 jul 2026).
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
