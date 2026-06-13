import type { TeamStanding } from "./standings";
import type { Match } from "./scoring";

// Motor del cuadro de eliminatorias para el simulador "Qué pasaría si…".
// Resuelve los 16 cruces de dieciseisavos a partir de la clasificación simulada
// de grupos y propaga los ganadores elegidos por el usuario por todo el bracket.

export type Side =
  | { kind: "group"; pos: 1 | 2; group: string }
  | { kind: "third"; candidates: string[] }
  | { kind: "winner"; match: string };

export interface BracketMatchDef {
  id: string;        // nº de partido FIFA (73..104)
  round: "R32" | "R16" | "QF" | "SF" | "FINAL";
  home: Side;
  away: Side;
}

// Definición oficial del cuadro 2026 (números de partido M73–M104, FIFA).
export const BRACKET_2026: BracketMatchDef[] = [
  // ── Dieciseisavos ──
  { id: "73", round: "R32", home: { kind: "group", pos: 2, group: "A" }, away: { kind: "group", pos: 2, group: "B" } },
  { id: "74", round: "R32", home: { kind: "group", pos: 1, group: "E" }, away: { kind: "third", candidates: ["A", "B", "C", "D", "F"] } },
  { id: "75", round: "R32", home: { kind: "group", pos: 1, group: "F" }, away: { kind: "group", pos: 2, group: "C" } },
  { id: "76", round: "R32", home: { kind: "group", pos: 1, group: "C" }, away: { kind: "group", pos: 2, group: "F" } },
  { id: "77", round: "R32", home: { kind: "group", pos: 1, group: "I" }, away: { kind: "third", candidates: ["C", "D", "F", "G", "H"] } },
  { id: "78", round: "R32", home: { kind: "group", pos: 2, group: "E" }, away: { kind: "group", pos: 2, group: "I" } },
  { id: "79", round: "R32", home: { kind: "group", pos: 1, group: "A" }, away: { kind: "third", candidates: ["C", "E", "F", "H", "I"] } },
  { id: "80", round: "R32", home: { kind: "group", pos: 1, group: "L" }, away: { kind: "third", candidates: ["E", "H", "I", "J", "K"] } },
  { id: "81", round: "R32", home: { kind: "group", pos: 1, group: "D" }, away: { kind: "third", candidates: ["B", "E", "F", "I", "J"] } },
  { id: "82", round: "R32", home: { kind: "group", pos: 1, group: "G" }, away: { kind: "third", candidates: ["A", "E", "H", "I", "J"] } },
  { id: "83", round: "R32", home: { kind: "group", pos: 2, group: "K" }, away: { kind: "group", pos: 2, group: "L" } },
  { id: "84", round: "R32", home: { kind: "group", pos: 1, group: "H" }, away: { kind: "group", pos: 2, group: "J" } },
  { id: "85", round: "R32", home: { kind: "group", pos: 1, group: "B" }, away: { kind: "third", candidates: ["E", "F", "G", "I", "J"] } },
  { id: "86", round: "R32", home: { kind: "group", pos: 1, group: "J" }, away: { kind: "group", pos: 2, group: "H" } },
  { id: "87", round: "R32", home: { kind: "group", pos: 1, group: "K" }, away: { kind: "third", candidates: ["D", "E", "I", "J", "L"] } },
  { id: "88", round: "R32", home: { kind: "group", pos: 2, group: "D" }, away: { kind: "group", pos: 2, group: "G" } },
  // ── Octavos ──
  { id: "89", round: "R16", home: { kind: "winner", match: "74" }, away: { kind: "winner", match: "77" } },
  { id: "90", round: "R16", home: { kind: "winner", match: "73" }, away: { kind: "winner", match: "75" } },
  { id: "91", round: "R16", home: { kind: "winner", match: "76" }, away: { kind: "winner", match: "78" } },
  { id: "92", round: "R16", home: { kind: "winner", match: "79" }, away: { kind: "winner", match: "80" } },
  { id: "93", round: "R16", home: { kind: "winner", match: "83" }, away: { kind: "winner", match: "84" } },
  { id: "94", round: "R16", home: { kind: "winner", match: "81" }, away: { kind: "winner", match: "82" } },
  { id: "95", round: "R16", home: { kind: "winner", match: "86" }, away: { kind: "winner", match: "88" } },
  { id: "96", round: "R16", home: { kind: "winner", match: "85" }, away: { kind: "winner", match: "87" } },
  // ── Cuartos ──
  { id: "97", round: "QF", home: { kind: "winner", match: "89" }, away: { kind: "winner", match: "90" } },
  { id: "98", round: "QF", home: { kind: "winner", match: "93" }, away: { kind: "winner", match: "94" } },
  { id: "99", round: "QF", home: { kind: "winner", match: "91" }, away: { kind: "winner", match: "92" } },
  { id: "100", round: "QF", home: { kind: "winner", match: "95" }, away: { kind: "winner", match: "96" } },
  // ── Semifinales ──
  { id: "101", round: "SF", home: { kind: "winner", match: "97" }, away: { kind: "winner", match: "98" } },
  { id: "102", round: "SF", home: { kind: "winner", match: "99" }, away: { kind: "winner", match: "100" } },
  // ── Final ──
  { id: "104", round: "FINAL", home: { kind: "winner", match: "101" }, away: { kind: "winner", match: "102" } },
];

const TBD = "Por determinar";
const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

// Marcador de un cruce de eliminatorias. Si hay empate en goles, `pen` indica
// quién pasa por penaltis ("home" | "away").
export interface KoScore {
  h: number;
  a: number;
  pen?: "home" | "away";
}

export interface ResolvedBracketMatch {
  id: string;
  round: BracketMatchDef["round"];
  home: string;
  away: string;
  ready: boolean;                 // ambos equipos conocidos
  score: KoScore | null;          // marcador puesto por el usuario
  winner: "home" | "away" | null; // ganador resultante
}

// koScores = { [matchId]: { h, a, pen? } } marcadores que pone el usuario.
export function simulateBracket(
  standings: Record<string, TeamStanding[]>,
  koScores: Record<string, KoScore>
): ResolvedBracketMatch[] {
  // ¿Cada grupo tiene sus 3 jornadas completas? Solo entonces fijamos posiciones.
  const groupComplete = (g: string) => {
    const t = standings[g];
    return !!t && t.length === 4 && t.every((x) => x.played >= 3);
  };

  // Ranking de mejores terceros entre los grupos COMPLETOS.
  const thirds = GROUP_LETTERS.filter((g) => groupComplete(g) && standings[g]?.[2])
    .map((g) => ({ group: g, t: standings[g][2] }))
    .sort(
      (a, b) =>
        b.t.pts - a.t.pts ||
        b.t.gd - a.t.gd ||
        b.t.gf - a.t.gf ||
        a.t.name.localeCompare(b.t.name, "es")
    );
  const qualifiedThirds = new Set(thirds.slice(0, 8).map((x) => x.group));
  const usedThirds = new Set<string>();

  const winnerTeam: Record<string, string> = {}; // matchId -> equipo ganador

  function resolveSide(side: Side): string {
    if (side.kind === "group") {
      if (!groupComplete(side.group)) return TBD;
      return standings[side.group]?.[side.pos - 1]?.name ?? TBD;
    }
    if (side.kind === "third") {
      for (const x of thirds) {
        if (side.candidates.includes(x.group) && qualifiedThirds.has(x.group) && !usedThirds.has(x.group)) {
          usedThirds.add(x.group);
          return x.t.name;
        }
      }
      return TBD;
    }
    return winnerTeam[side.match] ?? TBD;
  }

  function winnerOf(score: KoScore | undefined): "home" | "away" | null {
    if (!score) return null;
    if (score.h > score.a) return "home";
    if (score.a > score.h) return "away";
    return score.pen ?? null; // empate → penaltis (si elegido)
  }

  const out: ResolvedBracketMatch[] = [];
  // BRACKET_2026 está en orden topológico (R32 → … → Final).
  for (const def of BRACKET_2026) {
    const home = resolveSide(def.home);
    const away = resolveSide(def.away);
    const ready = home !== TBD && away !== TBD;
    const score = ready ? (koScores[def.id] ?? null) : null;
    const winner = ready ? winnerOf(score ?? undefined) : null;
    if (winner) winnerTeam[def.id] = winner === "home" ? home : away;
    out.push({ id: def.id, round: def.round, home, away, ready, score, winner });
  }
  return out;
}

// Convierte los cruces resueltos en "Match" puntuables para la porra (todos los
// que tienen marcador). En knockout, un empate cuenta como decidido por penaltis.
export function bracketToMatches(resolved: ResolvedBracketMatch[]): Match[] {
  const matches: Match[] = [];
  for (const m of resolved) {
    if (!m.ready || !m.score) continue;
    const { h, a } = m.score;
    matches.push({
      id: `ko-${m.id}`,
      home: m.home,
      away: m.away,
      homeGoals: h,
      awayGoals: a,
      phase: "knockout",
      penalties: h === a, // empate decidido en penaltis
      played: true,
    });
  }
  return matches;
}

