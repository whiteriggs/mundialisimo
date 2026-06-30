import { getGroupId, DEFAULT_GROUP } from "./group";
import { USERS } from "./auth";
import { fetchAllMatches, isLiveStatus } from "./football-api";
import { buildTeamTotals, type Match } from "./scoring";
import { teamName } from "./teams";
import { readCollection } from "./fsread";

export interface LeaderboardRow {
  user: string;
  total: number;
  confirmed: boolean;
}

type FsValue = {
  stringValue?: string;
  booleanValue?: boolean;
  arrayValue?: { values?: FsValue[] };
};
type FsDoc = { name: string; fields?: Record<string, FsValue> };

function strArray(v?: FsValue): string[] {
  return (v?.arrayValue?.values ?? []).map((x) => x.stringValue ?? "").filter(Boolean);
}

type BetDoc = { user: string; favorites: string[]; antiFavorites: string[]; confirmed: boolean };
export type { BetDoc };

// Lecturas a través del Worker (cacheadas) para no quemar la cuota de Firestore
// con el polling de muchos clientes.
export async function fetchUsersRest(groupId: string): Promise<string[]> {
  const docs = (await readCollection("config")) as FsDoc[];
  const usersDoc = docs.find((d) => d.name.endsWith("/config/users"));
  const list = strArray(usersDoc?.fields?.list);
  if (list.length > 0) return list;
  return groupId === DEFAULT_GROUP ? USERS : [];
}

// Premio especial (manual) de la pestaña Estadísticas, editable desde Admin.
export interface SpecialAward {
  winner: string | null;
  blurb: string | null;
}
export async function fetchSpecialAward(): Promise<SpecialAward> {
  const docs = (await readCollection("config").catch(() => [])) as FsDoc[];
  const doc = docs.find((d) => d.name.endsWith("/config/specialAward"));
  return {
    winner: doc?.fields?.winner?.stringValue ?? null,
    blurb: doc?.fields?.blurb?.stringValue ?? null,
  };
}

export async function fetchBetsRest(groupId: string): Promise<BetDoc[]> {
  void groupId; // el grupo activo lo resuelve readCollection vía getGroupId
  const docs = (await readCollection("bets")) as FsDoc[];
  return docs.map((doc) => ({
    user: doc.name.split("/").pop() ?? "",
    favorites: strArray(doc.fields?.favorites),
    antiFavorites: strArray(doc.fields?.antiFavorites),
    confirmed: doc.fields?.confirmed?.booleanValue ?? false,
  }));
}

// Calcula la clasificación actual de la porra del grupo activo, usando los
// marcadores del Worker (incluye EN VIVO) y las apuestas leídas por REST.
export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const groupId = getGroupId();
  const [apiAll, users, bets] = await Promise.all([
    fetchAllMatches().catch(() => []),
    fetchUsersRest(groupId),
    fetchBetsRest(groupId),
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
