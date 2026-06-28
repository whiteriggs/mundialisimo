"use client";

import NavBar from "@/components/NavBar";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useCallback, useState } from "react";
import { getStoredUser, clearUser } from "@/lib/auth";
import { fetchKnockoutMatches, ApiKnockoutMatch, ApiAllMatch, fetchAllMatches, isLiveStatus } from "@/lib/football-api";
import { makeBracketResolver } from "@/lib/knockout";
import { BRACKET_2026, type Side } from "@/lib/simulateBracket";
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
  mid?: string; // número de partido FIFA (73–104), para propagar ganadores
};
// BHalf: array of rounds, each round is array of pairs, each pair is 1 or 2 matches
type BHalf = BMatch[][][];

const TBD: BMatch = { home: "Por determinar", away: "Por determinar", isTbd: true };

// TBD con fecha (rondas cuyos equipos aún no se conocen pero sí la fecha).
const tbd = (date: string): BMatch => ({ ...TBD, date });
// TBD con fecha y número de partido FIFA (para propagar ganadores a la ronda).
const tbdM = (date: string, mid: string): BMatch => ({ ...TBD, date, mid });

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
      { home: "1º Gr. E", away: "M.3º A/B/C/D/F", date: "29 jun", mid: "74" },
      { home: "1º Gr. I", away: "M.3º C/D/F/G/H", date: "30 jun", mid: "77" },
    ],
    [
      { home: "2º Gr. A", away: "2º Gr. B", date: "28 jun", mid: "73" },
      { home: "1º Gr. F", away: "2º Gr. C", date: "29 jun", mid: "75" },
    ],
    [
      { home: "2º Gr. K", away: "2º Gr. L", date: "2 jul", mid: "83" },
      { home: "1º Gr. H", away: "2º Gr. J", date: "2 jul", mid: "84" },
    ],
    [
      { home: "1º Gr. D", away: "M.3º B/E/F/I/J", date: "1 jul", mid: "81" },
      { home: "1º Gr. G", away: "M.3º A/E/H/I/J", date: "1 jul", mid: "82" },
    ],
  ],
  // R16 — 2 pares × 2 partidos
  [
    [
      { home: "Gan. 1ºE/3º", away: "Gan. 1ºI/3º", date: "4 jul", mid: "89" }, // W74 vs W77
      { home: "Gan. 2ºA/2ºB", away: "Gan. 1ºF/2ºC", date: "4 jul", mid: "90" }, // W73 vs W75
    ],
    [
      { home: "Gan. 2ºK/2ºL", away: "Gan. 1ºH/2ºJ", date: "6 jul", mid: "93" }, // W83 vs W84
      { home: "Gan. 1ºD/3º", away: "Gan. 1ºG/3º", date: "6 jul", mid: "94" }, // W81 vs W82
    ],
  ],
  // QF — 1 par × 2 partidos
  [
    [tbdM("9 jul", "97"), tbdM("10 jul", "98")],
  ],
  // SF — 1 partido
  [
    [tbdM("14 jul", "101")],
  ],
];

// Right half column order in DOM: SF, QF, R16, R32
const RIGHT_HALF: BHalf = [
  // SF
  [[tbdM("15 jul", "102")]],
  // QF
  [[tbdM("11 jul", "99"), tbdM("11 jul", "100")]],
  // R16 — 2 pares × 2 partidos
  [
    [
      { home: "Gan. 1ºC/2ºF", away: "Gan. 2ºE/2ºI", date: "5 jul", mid: "91" }, // W76 vs W78
      { home: "Gan. 1ºA/3º", away: "Gan. 1ºL/3º", date: "5 jul", mid: "92" }, // W79 vs W80
    ],
    [
      { home: "Gan. 1ºJ/2ºH", away: "Gan. 2ºD/2ºG", date: "7 jul", mid: "95" }, // W86 vs W88
      { home: "Gan. 1ºB/3º", away: "Gan. 1ºK/3º", date: "7 jul", mid: "96" }, // W85 vs W87
    ],
  ],
  // R32 — 4 pares × 2 partidos
  [
    [
      { home: "1º Gr. C", away: "2º Gr. F", date: "29 jun", mid: "76" },
      { home: "2º Gr. E", away: "2º Gr. I", date: "30 jun", mid: "78" },
    ],
    [
      { home: "1º Gr. A", away: "M.3º C/E/F/H/I", date: "30 jun", mid: "79" },
      { home: "1º Gr. L", away: "M.3º E/H/I/J/K", date: "1 jul", mid: "80" },
    ],
    [
      { home: "1º Gr. J", away: "2º Gr. H", date: "3 jul", mid: "86" },
      { home: "2º Gr. D", away: "2º Gr. G", date: "3 jul", mid: "88" },
    ],
    [
      { home: "1º Gr. B", away: "M.3º E/F/G/I/J", date: "2 jul", mid: "85" },
      { home: "1º Gr. K", away: "M.3º D/E/I/J/L", date: "3 jul", mid: "87" },
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

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

interface SlotInfo {
  home?: string;
  away?: string;
  homeProv?: boolean;
  awayProv?: boolean;
  km?: ApiKnockoutMatch;
}

// Resuelve TODO el cuadro de eliminatorias a partir de los resultados reales:
//  • Dieciseisavos: cada hueco se empareja por "ancla" (1º/2º de grupo conocido)
//    con el partido real de la API → terceros incluidos como manda FIFA.
//  • Octavos → Final: el ganador de cada cruce (incluido el de penaltis, vía el
//    campo `winner`) se propaga al hueco de la ronda siguiente.
// Devuelve, por número de partido FIFA, los equipos y el partido real (con
// marcador) cuando se conocen.
function resolveTree(
  all: ApiAllMatch[],
  knockout: ApiKnockoutMatch[]
): Record<string, SlotInfo> {
  const resolve = makeBracketResolver(all);
  const groupMatches = all.filter((m) => m.phase === "groups");
  const groupsDone = groupMatches.length > 0 && groupMatches.every((m) => m.played);

  const r32Api = knockout.filter((m) => m.stage === "ROUND_OF_32");
  const koByPair = new Map<string, ApiKnockoutMatch>();
  for (const m of knockout) {
    if (m.home !== "Por determinar" && m.away !== "Por determinar") {
      koByPair.set(pairKey(m.home, m.away), m);
    }
  }

  const groupAnchor = (side: Side): string | null => {
    if (side.kind !== "group") return null;
    const r = resolve(`${side.pos}º Gr. ${side.group}`);
    return r.provisional ? r.name : null;
  };
  const winnerById: Record<string, string> = {};
  const winnerSide = (side: Side): string | null =>
    side.kind === "winner" ? winnerById[side.match] ?? null : null;

  const info: Record<string, SlotInfo> = {};
  for (const def of BRACKET_2026) {
    let home: string | undefined;
    let away: string | undefined;
    let homeProv = false;
    let awayProv = false;
    let km: ApiKnockoutMatch | undefined;

    if (def.round === "R32") {
      const anchors = [groupAnchor(def.home), groupAnchor(def.away)].filter(Boolean) as string[];
      km = r32Api.find((x) => anchors.includes(x.home) || anchors.includes(x.away));
      if (km) {
        home = km.home;
        away = km.away;
      } else {
        // Antes del sorteo de eliminatorias: mostrar 1º/2º provisionales.
        const ha = groupAnchor(def.home);
        const aa = groupAnchor(def.away);
        if (ha) { home = ha; homeProv = !groupsDone; }
        if (aa) { away = aa; awayProv = !groupsDone; }
      }
    } else {
      home = winnerSide(def.home) ?? undefined;
      away = winnerSide(def.away) ?? undefined;
      if (home && away) km = koByPair.get(pairKey(home, away));
    }

    if (km && km.finished) {
      const w = km.winner === "home" ? km.home : km.winner === "away" ? km.away : null;
      if (w) winnerById[def.id] = w;
    }
    info[def.id] = { home, away, homeProv, awayProv, km };
  }
  return info;
}

// Convierte un hueco del cuadro estático en su partido real según el árbol.
function slotToBMatch(s: BMatch, info: Record<string, SlotInfo>): BMatch {
  if (!s.mid) return s;
  const d = info[s.mid];
  if (!d) return s;
  if (d.km) {
    const b = apiToBMatch(d.km);
    return { ...b, mid: s.mid, date: s.date ?? b.date };
  }
  const home = d.home ?? s.home;
  const away = d.away ?? s.away;
  return {
    ...s,
    home,
    away,
    homeProv: d.homeProv,
    awayProv: d.awayProv,
    isTbd: home === "Por determinar" && away === "Por determinar",
  };
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

const FINAL_MATCH: BMatch = { home: "Por determinar", away: "Por determinar", date: "19 jul · MetLife, NY", isTbd: true, mid: "104" };

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

      // Resuelve todo el cuadro (ancla en dieciseisavos + propagación del ganador
      // ronda a ronda, penaltis incluidos) y vuelca cada hueco a su partido real.
      const info = resolveTree(all, knockout);
      let prov = false;
      const mapHalf = (half: BHalf): BHalf =>
        half.map((col) =>
          col.map((pair) =>
            pair.map((s) => {
              const b = slotToBMatch(s, info);
              if (b.homeProv || b.awayProv) prov = true;
              return b;
            })
          )
        );

      setLeftHalf(mapHalf(LEFT_HALF));
      setRightHalf(mapHalf(RIGHT_HALF));
      setFinalMatch(slotToBMatch(FINAL_MATCH, info));
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
