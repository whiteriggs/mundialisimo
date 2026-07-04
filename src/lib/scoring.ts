export type Phase = "groups" | "third" | "knockout";

export type Match = {
  id: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  phase: Phase;
  penalties: boolean;
  played: boolean;
  matchday?: number | null;
  roundKey?: string;
  /** En un cruce decidido en penaltis, quién ganó la tanda. */
  penWinner?: "home" | "away";
  /** Goles de la tanda de penaltis (solo partidos reales con tanda oficial). */
  penHome?: number;
  penAway?: number;
};

/**
 * Opciones de puntuación para escenarios "qué pasaría si". Por defecto (ambas
 * false) se aplican las reglas oficiales de la porra.
 */
export interface ScoringOptions {
  /** Si true, un cruce decidido en penaltis cuenta como victoria del ganador (no empate). */
  penaltyWin?: boolean;
  /** Si true (requiere penaltyWin), suma los goles de la tanda de penaltis (solo con penHome/penAway). */
  penaltyGoals?: boolean;
}

/**
 * Returns points earned by each team in a single match.
 * Rules:
 *   Groups & third-place: +1/goal, +5/draw, +10/win
 *   Knockout:             +1/goal, +5/playing, +5/draw, +10/win
 *   Penalties → counts as draw (+5 each). Goals in shootout don't count.
 * Con `opts.penaltyWin` el ganador de la tanda cobra la victoria (+10) en vez del
 * empate; con `opts.penaltyGoals` se suman además los goles de la tanda.
 */
export function matchPoints(match: Match, opts: ScoringOptions = {}): Record<string, number> {
  if (!match.played) return {};

  const pts: Record<string, number> = {
    [match.home]: match.homeGoals,
    [match.away]: match.awayGoals,
  };

  if (match.phase === "knockout") {
    pts[match.home] += 5;
    pts[match.away] += 5;
  }

  if (match.penalties) {
    // Goles de la tanda (solo si hay marcador real y el toggle está activo).
    if (opts.penaltyGoals && match.penHome != null && match.penAway != null) {
      pts[match.home] += match.penHome;
      pts[match.away] += match.penAway;
    }
    if (opts.penaltyWin && match.penWinner) {
      // Cuenta como victoria del que ganó la tanda; el perdedor no cobra bonus.
      const winner = match.penWinner === "home" ? match.home : match.away;
      pts[winner] += 10;
    } else {
      // Por defecto: se considera empate → ambos cobran el bonus de empate.
      pts[match.home] += 5;
      pts[match.away] += 5;
    }
  } else if (match.homeGoals > match.awayGoals) {
    pts[match.home] += 10;
  } else if (match.awayGoals > match.homeGoals) {
    pts[match.away] += 10;
  } else {
    pts[match.home] += 5;
    pts[match.away] += 5;
  }

  return pts;
}

/** Accumulates all played matches into { teamName → totalPoints }. */
export function buildTeamTotals(matches: Match[], opts: ScoringOptions = {}): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const match of matches) {
    for (const [team, pts] of Object.entries(matchPoints(match, opts))) {
      totals[team] = (totals[team] ?? 0) + pts;
    }
  }
  return totals;
}

/**
 * Calculates a user's total score from their bet.
 * score = sum(favorite team points) − sum(antifavorite team points)
 */
export function calcUserScore(
  favorites: string[],
  antiFavorites: string[],
  teamTotals: Record<string, number>
): number {
  const sum = (ids: string[]) =>
    ids.reduce((acc, id) => acc + (teamTotals[id] ?? 0), 0);
  return sum(favorites) - sum(antiFavorites);
}
