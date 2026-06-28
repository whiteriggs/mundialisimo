"use client";

import NavBar from "@/components/NavBar";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useCallback, useState } from "react";
import { getStoredUser, clearUser } from "@/lib/auth";
import { fetchKnockoutMatches, ApiKnockoutMatch, fetchAllMatches, isLiveStatus } from "@/lib/football-api";
import { makeBracketResolver } from "@/lib/knockout";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import Flag from "@/components/Flag";

type BMatch = {
  home: string;
  away: string;
  date?: string;
  isTbd?: boolean;
  homeGoals?: number | null;
  awayGoals?: number | null;
  finished?: boolean;
  live?: boolean;
  winner?: "home" | "away" | null;
  penalties?: boolean;
  homeProv?: boolean;
  awayProv?: boolean;
};
// BHalf: array of rounds, each round is array of pairs, each pair is 1 or 2 matches
type BHalf = BMatch[][][];

const TBD: BMatch = { home: "Por determinar", away: "Por determinar", isTbd: true };

// TBD con fecha (rondas cuyos equipos aún no se conocen pero sí la fecha).
const tbd = (date: string): BMatch => ({ ...TBD, date });

// ─────────────────────────────────────────────────────────────────
//  Cuadro oficial — fuente: FIFA / Wikipedia (2026 knockout stage).
//  Números de partido FIFA (M73–M104) entre paréntesis.
//  R32 (dieciseisavos): cruces por grupos.
//  R16 (octavos): "Gan. X/Y" = ganador del cruce de dieciseisavos.
//  Left half: R32 → R16 → QF → SF  (lado izquierdo del cuadro)
//  Right half: SF → QF → R16 → R32 (lado derecho, espejado)
// ─────────────────────────────────────────────────────────────────

// Left half column order in DOM: R32, R16, QF, SF
const LEFT_HALF: BHalf = [
  // R32 — 4 pares × 2 partidos
  [
    [
      { home: "1º Gr. E", away: "M.3º A/B/C/D/F", date: "29 jun" }, // M74
      { home: "1º Gr. I", away: "M.3º C/D/F/G/H", date: "30 jun" }, // M77
    ],
    [
      { home: "2º Gr. A", away: "2º Gr. B", date: "28 jun" }, // M73
      { home: "1º Gr. F", away: "2º Gr. C", date: "29 jun" }, // M75
    ],
    [
      { home: "2º Gr. K", away: "2º Gr. L", date: "2 jul" }, // M83
      { home: "1º Gr. H", away: "2º Gr. J", date: "2 jul" }, // M84
    ],
    [
      { home: "1º Gr. D", away: "M.3º B/E/F/I/J", date: "1 jul" }, // M81
      { home: "1º Gr. G", away: "M.3º A/E/H/I/J", date: "1 jul" }, // M82
    ],
  ],
  // R16 — 2 pares × 2 partidos
  [
    [
      { home: "Gan. 1ºE/3º", away: "Gan. 1ºI/3º", date: "4 jul" }, // M89 = W74 vs W77
      { home: "Gan. 2ºA/2ºB", away: "Gan. 1ºF/2ºC", date: "4 jul" }, // M90 = W73 vs W75
    ],
    [
      { home: "Gan. 2ºK/2ºL", away: "Gan. 1ºH/2ºJ", date: "6 jul" }, // M93 = W83 vs W84
      { home: "Gan. 1ºD/3º", away: "Gan. 1ºG/3º", date: "6 jul" }, // M94 = W81 vs W82
    ],
  ],
  // QF — 1 par × 2 partidos
  [
    [tbd("9 jul"), tbd("10 jul")], // M97, M98
  ],
  // SF — 1 partido
  [
    [tbd("14 jul")], // M101
  ],
];

// Right half column order in DOM: SF, QF, R16, R32
const RIGHT_HALF: BHalf = [
  // SF
  [[tbd("15 jul")]], // M102
  // QF
  [[tbd("11 jul"), tbd("11 jul")]], // M99, M100
  // R16 — 2 pares × 2 partidos
  [
    [
      { home: "Gan. 1ºC/2ºF", away: "Gan. 2ºE/2ºI", date: "5 jul" }, // M91 = W76 vs W78
      { home: "Gan. 1ºA/3º", away: "Gan. 1ºL/3º", date: "5 jul" }, // M92 = W79 vs W80
    ],
    [
      { home: "Gan. 1ºJ/2ºH", away: "Gan. 2ºD/2ºG", date: "7 jul" }, // M95 = W86 vs W88
      { home: "Gan. 1ºB/3º", away: "Gan. 1ºK/3º", date: "7 jul" }, // M96 = W85 vs W87
    ],
  ],
  // R32 — 4 pares × 2 partidos
  [
    [
      { home: "1º Gr. C", away: "2º Gr. F", date: "29 jun" }, // M76
      { home: "2º Gr. E", away: "2º Gr. I", date: "30 jun" }, // M78
    ],
    [
      { home: "1º Gr. A", away: "M.3º C/E/F/H/I", date: "30 jun" }, // M79
      { home: "1º Gr. L", away: "M.3º E/H/I/J/K", date: "1 jul" }, // M80
    ],
    [
      { home: "1º Gr. J", away: "2º Gr. H", date: "3 jul" }, // M86
      { home: "2º Gr. D", away: "2º Gr. G", date: "3 jul" }, // M88
    ],
    [
      { home: "1º Gr. B", away: "M.3º E/F/G/I/J", date: "2 jul" }, // M85
      { home: "1º Gr. K", away: "M.3º D/E/I/J/L", date: "3 jul" }, // M87
    ],
  ],
];

const LEFT_LABELS  = ["Dieciseisavos", "Octavos", "Cuartos", "Semifinal"];
const RIGHT_LABELS = ["Semifinal", "Cuartos", "Octavos", "Dieciseisavos"];

function apiToBMatch(m: ApiKnockoutMatch): BMatch {
  return {
    home: m.home,
    away: m.away,
    date: m.date,
    isTbd: m.home === "Por determinar" && m.away === "Por determinar",
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    finished: m.finished,
    live: m.live,
    winner: m.winner,
    penalties: m.penalties,
  };
}

function buildBracketFromApi(matches: ApiKnockoutMatch[]): {
  left: BHalf;
  right: BHalf;
  final: BMatch;
} {
  const by = (stage: string) => matches.filter((m) => m.stage === stage).map(apiToBMatch);
  const at = (arr: BMatch[], i: number): BMatch => arr[i] ?? TBD;
  // Una ronda solo se toma de la API si ya trae equipos reales; mientras sus
  // partidos sean "Por determinar", mantenemos las etiquetas del cuadro
  // estático ("Gan. 1ºE/3º", fechas, etc.).
  const ready = (arr: BMatch[]) =>
    arr.some((m) => !(m.home === "Por determinar" && m.away === "Por determinar"));

  const r32 = by("ROUND_OF_32");
  const r16 = by("ROUND_OF_16");
  const qf  = by("QUARTER_FINALS");
  const sf  = by("SEMI_FINALS");
  const fin = by("FINAL");

  // R32 se coloca por separado (emparejamiento por ancla), así que aquí siempre
  // partimos del cuadro estático para esa ronda.
  const left: BHalf = [
    LEFT_HALF[0],
    ready(r16) ? [[at(r16,0), at(r16,1)], [at(r16,2), at(r16,3)]] : LEFT_HALF[1],
    ready(qf)  ? [[at(qf,0),  at(qf,1)]] : LEFT_HALF[2],
    ready(sf)  ? [[at(sf,0)]] : LEFT_HALF[3],
  ];
  const right: BHalf = [
    ready(sf)  ? [[at(sf,1)]] : RIGHT_HALF[0],
    ready(qf)  ? [[at(qf,2),  at(qf,3)]] : RIGHT_HALF[1],
    ready(r16) ? [[at(r16,4), at(r16,5)], [at(r16,6), at(r16,7)]] : RIGHT_HALF[2],
    RIGHT_HALF[3],
  ];

  return { left, right, final: ready(fin) ? fin[0] : { ...FINAL_MATCH } };
}

function MatchCard({ m, isFinal = false }: { m: BMatch; isFinal?: boolean }) {
  const showScore = (m.finished || m.live) && m.homeGoals !== null && m.homeGoals !== undefined;
  return (
    <div className={[
      "bk-match",
      m.isTbd  ? "bk-match--tbd"      : "",
      isFinal  ? "bk-match--final"    : "",
      m.finished ? "bk-match--finished" : "",
      m.live ? "bk-match--live" : "",
    ].join(" ").trim()}>
      <div className={[
        "bk-team",
        m.isTbd      ? "bk-team--tbd"    : "",
        m.homeProv   ? "bk-team--prov"   : "",
        m.winner === "home" ? "bk-team--winner" : "",
        m.winner === "away" ? "bk-team--loser"  : "",
      ].join(" ").trim()}>
        <span className="bk-team-name"><Flag name={m.home} />{m.home}{m.homeProv && <span className="bk-prov-mark" title="Posición provisional">·prov</span>}</span>
        {showScore && <span className="bk-team-score">{m.homeGoals}{m.penalties && m.winner === "home" ? "p" : ""}</span>}
      </div>
      <div className={[
        "bk-team",
        m.isTbd      ? "bk-team--tbd"    : "",
        m.awayProv   ? "bk-team--prov"   : "",
        m.winner === "away" ? "bk-team--winner" : "",
        m.winner === "home" ? "bk-team--loser"  : "",
      ].join(" ").trim()}>
        <span className="bk-team-name"><Flag name={m.away} />{m.away}{m.awayProv && <span className="bk-prov-mark" title="Posición provisional">·prov</span>}</span>
        {showScore && <span className="bk-team-score">{m.awayGoals}{m.penalties && m.winner === "away" ? "p" : ""}</span>}
      </div>
      {m.live && <div className="bk-live">EN VIVO</div>}
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
  const [leftHalf,   setLeftHalf]   = useState<BHalf>(LEFT_HALF);
  const [rightHalf,  setRightHalf]  = useState<BHalf>(RIGHT_HALF);
  const [finalMatch, setFinalMatch] = useState<BMatch>(FINAL_MATCH);
  const [apiNote, setApiNote]       = useState<string | null>(null);
  const [hasProvisional, setHasProvisional] = useState(false);
  const [anyLive, setAnyLive] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.push("/login"); return; }
    setUser(u);
  }, [router]);

  const loadData = useCallback(async () => {
    try {
      const [knockout, all] = await Promise.all([fetchKnockoutMatches(), fetchAllMatches()]);
      setAnyLive(all.some((m) => isLiveStatus(m.status)));
      const base = knockout.length
        ? buildBracketFromApi(knockout)
        : { left: LEFT_HALF, right: RIGHT_HALF, final: FINAL_MATCH };

      // Rellena los dieciseisavos. Cada hueco del cuadro estático tiene un lado
      // "ancla" ya conocido (1º/2º de un grupo). Buscamos el partido REAL de la
      // API que contiene ese equipo y lo colocamos ahí: así los terceros quedan
      // asignados como manda FIFA, sin depender del orden del array de la API.
      const resolve = makeBracketResolver(all);
      const r32Api = knockout.filter((m) => m.stage === "ROUND_OF_32");
      let prov = false;
      const fillR32 = (col: BHalf[number]) =>
        col.map((pair) =>
          pair.map((m): BMatch => {
            const h = resolve(m.home);
            const a = resolve(m.away);
            const anchors = [h.provisional ? h.name : null, a.provisional ? a.name : null].filter(
              Boolean
            ) as string[];
            const api = r32Api.find((x) => anchors.includes(x.home) || anchors.includes(x.away));
            if (api) return apiToBMatch(api); // equipos reales (incluye terceros) + marcador
            if (h.provisional || a.provisional) prov = true;
            return { ...m, home: h.name, away: a.name, homeProv: h.provisional, awayProv: a.provisional };
          })
        );
      // R32 está en la columna 0 del lado izquierdo y la 3 del derecho.
      const left = base.left.map((col, ci) => (ci === 0 ? fillR32(col) : col));
      const right = base.right.map((col, ci) => (ci === 3 ? fillR32(col) : col));

      setLeftHalf(left);
      setRightHalf(right);
      setFinalMatch(base.final);
      setHasProvisional(prov);
      setApiNote(null);
    } catch {
      setApiNote("No se pudieron cargar los datos en directo. Mostrando cuadro del sorteo oficial.");
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useLiveRefresh(loadData, anyLive ? 12_000 : 30_000);

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
        <NavBar user={user} />
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">⚽</div>
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
        {apiNote
          ? <p className="api-notice" style={{ marginBottom: 20 }}>{apiNote}</p>
          : <p className="api-notice" style={{ marginBottom: 20 }}>
              {hasProvisional
                ? "Posiciones marcadas «·prov» = clasificación PROVISIONAL según los grupos en curso (cambiarán hasta el final de los grupos). Los huecos M.3º se mantienen oficiales hasta publicación FIFA."
                : "Los cruces de dieciseisavos son fijos. M.3º se muestra como placeholder oficial hasta que FIFA publique los cruces."}
            </p>
        }

        <div className="bk-scroll-hint">← Desplaza para ver el cuadro completo →</div>

        <div className="bk-scroll">
          <div className="bk-stage">
            <HalfBracket half={leftHalf}  labels={LEFT_LABELS}  side="left" />

            {/* Final */}
            <div className="bk-final-col">
              <div className="bk-col-label bk-col-label--final">Final</div>
              <div className="bk-col-body">
                <div className="bk-pair bk-pair--single">
                  <div className="bk-entry">
                    <MatchCard m={finalMatch} isFinal />
                  </div>
                </div>
              </div>
            </div>

            <HalfBracket half={rightHalf} labels={RIGHT_LABELS} side="right" />
          </div>
        </div>
      </div>
    </main>
  );
}
