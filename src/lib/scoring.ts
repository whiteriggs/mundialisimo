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
};

/**
 * Returns points earned by each team in a single match.
 * Rules:
 *   Groups & third-place: +1/goal, +5/draw, +10/win
 *   Knockout:             +1/goal, +5/playing, +5/draw, +10/win
 *   Penalties → counts as draw (+5 each). Goals in shootout don't count.
 */
export function matchPoints(match: Match): Record<string, number> {
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
    // Decided by penalties → both teams get draw bonus
    pts[match.home] += 5;
    pts[match.away] += 5;
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
export function buildTeamTotals(matches: Match[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const match of matches) {
    for (const [team, pts] of Object.entries(matchPoints(match))) {
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
  teamTotals: Record<string, number>,
  idToName: (id: string) => string
): number {
  const sum = (ids: string[]) =>
    ids.reduce((acc, id) => acc + (teamTotals[idToName(id)] ?? 0), 0);
  return sum(favorites) - sum(antiFavorites);
}
