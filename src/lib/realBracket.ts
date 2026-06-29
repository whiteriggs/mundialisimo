import { BRACKET_2026, type Side } from "./simulateBracket";
import { makeBracketResolver } from "./knockout";
import type { ApiAllMatch, ApiKnockoutMatch } from "./football-api";

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

export interface RealSlot {
  home?: string;
  away?: string;
  homeProv?: boolean;
  awayProv?: boolean;
  km?: ApiKnockoutMatch;
}

// Resuelve TODO el cuadro de eliminatorias a partir de los resultados REALES:
//  • Dieciseisavos: cada hueco se empareja por "ancla" (1º/2º de grupo conocido)
//    con el partido real de la API → terceros incluidos como manda FIFA.
//  • Octavos → Final: el ganador de cada cruce (incluido el de penaltis, vía el
//    campo `winner`) se propaga al hueco de la ronda siguiente.
// Devuelve, por número de partido FIFA, los equipos y el partido real (con
// marcador) cuando se conocen.
export function resolveRealBracket(
  all: ApiAllMatch[],
  knockout: ApiKnockoutMatch[]
): Record<string, RealSlot> {
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

  const info: Record<string, RealSlot> = {};
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
