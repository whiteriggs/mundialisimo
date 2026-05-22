"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getStoredUser, clearUser } from "@/lib/auth";

type BMatch = { home: string; away: string; date?: string; isTbd?: boolean };
// BHalf: array of rounds, each round is array of pairs, each pair is 1 or 2 matches
type BHalf = BMatch[][][];

const TBD: BMatch = { home: "Por determinar", away: "Por determinar", isTbd: true };

// ─────────────────────────────────────────────────────────────────
//  Official bracket — source: marca.com cuadro-final.html
//  Left half: R32 pairs → R16 → QF → SF  (left side of draw)
//  Right half: SF → QF → R16 → R32 pairs (right side, mirrored)
// ─────────────────────────────────────────────────────────────────

// Left half column order in DOM: R32, R16, QF, SF
const LEFT_HALF: BHalf = [
  // R32 — 4 pairs × 2 matches (feed into R16-1…R16-4)
  [
    [
      { home: "2º Gr. A",  away: "2º Gr. B",         date: "28 jun" },
      { home: "1º Gr. E",  away: "M.3º A/B/C/D/F",  date: "29 jun" },
    ],
    [
      { home: "1º Gr. C",  away: "2º Gr. F",         date: "29 jun" },
      { home: "2º Gr. E",  away: "2º Gr. I",         date: "30 jun" },
    ],
    [
      { home: "1º Gr. F",  away: "2º Gr. C",         date: "30 jun" },
      { home: "1º Gr. I",  away: "M.3º C/D/F/G/H",  date: "30 jun" },
    ],
    [
      { home: "1º Gr. A",  away: "M.3º C/E/F/H/I",  date: "1 jul"  },
      { home: "1º Gr. L",  away: "M.3º E/H/I/J/K",  date: "1 jul"  },
    ],
  ],
  // R16 — 2 pairs × 2 matches
  [
    [TBD, TBD],
    [TBD, TBD],
  ],
  // QF — 1 pair × 2 matches
  [
    [TBD, TBD],
  ],
  // SF — 1 single match
  [
    [TBD],
  ],
];

// Right half column order in DOM: SF, QF, R16, R32
const RIGHT_HALF: BHalf = [
  // SF
  [[TBD]],
  // QF
  [[TBD, TBD]],
  // R16 — 2 pairs × 2 matches
  [
    [TBD, TBD],
    [TBD, TBD],
  ],
  // R32 — 4 pairs × 2 matches (feed into R16-5…R16-8)
  [
    [
      { home: "1º Gr. G",  away: "M.3º A/E/H/I/J",  date: "1 jul"  },
      { home: "1º Gr. D",  away: "M.3º B/E/F/I/J",  date: "2 jul"  },
    ],
    [
      { home: "1º Gr. H",  away: "2º Gr. J",         date: "2 jul"  },
      { home: "2º Gr. K",  away: "2º Gr. L",         date: "3 jul"  },
    ],
    [
      { home: "1º Gr. B",  away: "M.3º E/F/G/I/J",  date: "3 jul"  },
      { home: "1º Gr. J",  away: "2º Gr. H",         date: "3 jul"  },
    ],
    [
      { home: "2º Gr. D",  away: "2º Gr. G",         date: "3 jul"  },
      { home: "1º Gr. K",  away: "M.3º D/E/I/J/L",  date: "4 jul"  },
    ],
  ],
];

const LEFT_LABELS  = ["Dieciseisavos", "Octavos", "Cuartos", "Semifinal"];
const RIGHT_LABELS = ["Semifinal", "Cuartos", "Octavos", "Dieciseisavos"];

function MatchCard({ m, isFinal = false }: { m: BMatch; isFinal?: boolean }) {
  return (
    <div className={[
      "bk-match",
      m.isTbd  ? "bk-match--tbd"   : "",
      isFinal  ? "bk-match--final" : "",
    ].join(" ").trim()}>
      <div className={`bk-team${m.isTbd ? " bk-team--tbd" : ""}`}>{m.home}</div>
      <div className={`bk-team${m.isTbd ? " bk-team--tbd" : ""}`}>{m.away}</div>
      {m.date && <div className="bk-date">{m.date}</div>}
    </div>
  );
}

function HalfBracket({
  half, labels, side,
}: {
  half: BHalf;
  labels: string[];
  side: "left" | "right";
}) {
  return (
    <div className={`bk-half bk-half--${side}`}>
      {half.map((round, ri) => (
        <div key={ri} className="bk-col">
          <div className="bk-col-label">{labels[ri]}</div>
          <div className="bk-col-body">
            {round.map((pair, pi) => (
              <div
                key={pi}
                className={`bk-pair${pair.length === 1 ? " bk-pair--single" : ""}`}
              >
                {pair.map((match, mi) => (
                  <div key={mi} className="bk-entry">
                    <MatchCard m={match} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const FINAL_MATCH: BMatch = { home: "Por determinar", away: "Por determinar", date: "19 jul · MetLife, NY", isTbd: true };

export default function EliminatoriasPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.push("/login"); return; }
    setUser(u);
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
          {user === "Javi" && <Link href="/admin">Admin</Link>}
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
        <p className="api-notice" style={{ marginBottom: 20 }}>
          Los cruces de dieciseisavos son fijos. M.3º = mejor tercer clasificado de los grupos indicados.
        </p>

        <div className="bk-scroll-hint">← Desplaza para ver el cuadro completo →</div>

        <div className="bk-scroll">
          <div className="bk-stage">
            <HalfBracket half={LEFT_HALF}  labels={LEFT_LABELS}  side="left" />

            {/* Final */}
            <div className="bk-final-col">
              <div className="bk-col-label bk-col-label--final">Final</div>
              <div className="bk-col-body">
                <div className="bk-pair bk-pair--single">
                  <div className="bk-entry">
                    <MatchCard m={FINAL_MATCH} isFinal />
                  </div>
                </div>
              </div>
            </div>

            <HalfBracket half={RIGHT_HALF} labels={RIGHT_LABELS} side="right" />
          </div>
        </div>
      </div>
    </main>
  );
}
