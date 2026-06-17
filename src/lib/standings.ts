import { Match } from "./scoring";
import { TEAMS, GROUP_POOL, FIFA_GROUP_SEEDING } from "./teams";

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
  seed?: number; // FIFA pre-tournament seeding (0 = top seed)
};

function emptyStanding(name: string, group: string, seed: number): TeamStanding {
  return { name, group, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0, seed };
}

/**
 * Builds official FIFA-style group standings from played matches.
 * Only group-phase matches are counted (phase === "groups").
 * Tiebreaker order: Pts → GD → FIFA Seeding → name.
 * 
 * FIFA seeding is based on FIFA_GROUP_SEEDING order: first team in group = seed 0.
 * This ensures consistent tiebreaker results matching official FIFA standings.
 */
export function buildGroupStandings(
  matches: Match[]
): Record<string, TeamStanding[]> {
  const standingsMap: Record<string, TeamStanding> = {};

  // Pre-populate all 48 teams with their FIFA seeding
  for (const team of TEAMS) {
    const fifaSeeding = FIFA_GROUP_SEEDING[team.group];
    const index = fifaSeeding.indexOf(team.name);
    const seed = index >= 0 ? index : 99;
    standingsMap[team.name] = emptyStanding(team.name, team.group, seed);
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
        // 1. Puntos (descendente)
        if (b.pts !== a.pts) return b.pts - a.pts;
        // 2. Diferencia de goles (descendente)
        if (b.gd !== a.gd) return b.gd - a.gd;
        // 3. FIFA Seeding: lower seed number = higher priority (first in group)
        if ((a.seed ?? 99) !== (b.seed ?? 99)) return (a.seed ?? 99) - (b.seed ?? 99);
        // 4. Orden alfabético (último recurso)
        return a.name.localeCompare(b.name, "es");
      });
  }

  return result;
}
