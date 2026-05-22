import { Match } from "./scoring";
import { TEAMS, GROUP_POOL } from "./teams";

export type TeamStanding = {
  name: string;
  group: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number; // goals for
  ga: number; // goals against
  gd: number; // goal difference
  pts: number; // FIFA points: 3W 1D 0L
};

function emptyStanding(name: string, group: string): TeamStanding {
  return { name, group, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
}

/**
 * Builds official FIFA-style group standings from played matches.
 * Only group-phase matches are counted (phase === "groups").
 * Returns a Record<groupLetter, TeamStanding[]> sorted by: Pts → GD → GF → name.
 */
export function buildGroupStandings(
  matches: Match[]
): Record<string, TeamStanding[]> {
  const standingsMap: Record<string, TeamStanding> = {};

  // Pre-populate all 48 teams
  for (const team of TEAMS) {
    standingsMap[team.name] = emptyStanding(team.name, team.group);
  }

  for (const match of matches) {
    if (match.phase !== "groups" || !match.played) continue;

    const home = standingsMap[match.home];
    const away = standingsMap[match.away];
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.gf += match.homeGoals;
    home.ga += match.awayGoals;
    away.gf += match.awayGoals;
    away.ga += match.homeGoals;

    // Penalty shootout → draw in group stage (shouldn't happen, but be safe)
    const homeWins = match.penalties ? false : match.homeGoals > match.awayGoals;
    const awayWins = match.penalties ? false : match.awayGoals > match.homeGoals;
    const isDraw = !homeWins && !awayWins;

    if (homeWins) { home.won++; home.pts += 3; away.lost++; }
    else if (awayWins) { away.won++; away.pts += 3; home.lost++; }
    else { home.drawn++; away.drawn++; home.pts++; away.pts++; }
  }

  // Recalculate GD
  for (const s of Object.values(standingsMap)) {
    s.gd = s.gf - s.ga;
  }

  // Group by letter, sort within group
  const result: Record<string, TeamStanding[]> = {};
  for (const group of Object.keys(GROUP_POOL)) {
    result[group] = Object.values(standingsMap)
      .filter((s) => s.group === group)
      .sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.gd !== a.gd) return b.gd - a.gd;
        if (b.gf !== a.gf) return b.gf - a.gf;
        return a.name.localeCompare(b.name, "es");
      });
  }

  return result;
}
