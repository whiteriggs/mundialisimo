import { getDocs } from "firebase/firestore";
import { groupCollection } from "./db";
import { getUsers } from "./auth";
import { fetchAllMatches, isLiveStatus } from "./football-api";
import { buildTeamTotals, type Match } from "./scoring";
import { teamName } from "./teams";

export interface LeaderboardRow {
  user: string;
  total: number;
  confirmed: boolean;
}

type BetDoc = {
  user: string;
  favorites: string[];
  antiFavorites: string[];
  confirmed: boolean;
};

// Calcula la clasificación actual de la porra del grupo activo: lee apuestas y
// usuarios de Firestore + partidos del Worker (incluye los EN VIVO, igual que la
// página de Clasificación) y devuelve el ranking ordenado.
export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const [apiAll, betSnap, users] = await Promise.all([
    fetchAllMatches().catch(() => []),
    getDocs(groupCollection("bets")).catch(() => null),
    getUsers().catch(() => [] as string[]),
  ]);

  if (users.length === 0) return [];

  const scored: Match[] = apiAll
    .filter((m) => m.played || isLiveStatus(m.status))
    .map((m) => ({
      id: m.id,
      home: m.home,
      away: m.away,
      homeGoals: m.homeGoals ?? 0,
      awayGoals: m.awayGoals ?? 0,
      phase: m.phase,
      penalties: m.penalties,
      played: true,
    }));
  const teamTotals = buildTeamTotals(scored);

  const bets: BetDoc[] = (betSnap?.docs ?? []).map((d) => {
    const raw = d.data() as Partial<Omit<BetDoc, "user">>;
    return {
      user: d.id,
      favorites: raw.favorites ?? [],
      antiFavorites: raw.antiFavorites ?? [],
      confirmed: raw.confirmed ?? false,
    };
  });

  return users
    .map((u) => {
      const bet = bets.find((b) => b.user === u.toLowerCase());
      const fav = bet?.confirmed
        ? bet.favorites.reduce((s, id) => s + (teamTotals[teamName(id)] ?? 0), 0)
        : 0;
      const anti = bet?.confirmed
        ? bet.antiFavorites.reduce((s, id) => s + (teamTotals[teamName(id)] ?? 0), 0)
        : 0;
      return { user: u, total: fav - anti, confirmed: bet?.confirmed ?? false };
    })
    .sort((a, b) => b.total - a.total);
}
