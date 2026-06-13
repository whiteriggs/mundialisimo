import { getGroupId, DEFAULT_GROUP } from "./group";
import { USERS } from "./auth";
import { fetchAllMatches, isLiveStatus } from "./football-api";
import { buildTeamTotals, type Match } from "./scoring";
import { teamName } from "./teams";

export interface LeaderboardRow {
  user: string;
  total: number;
  confirmed: boolean;
}

// Lee Firestore por REST (GET normal), NO por el SDK. El SDK usa WebChannel, que
// es inestable en Safari/redes móviles y dejaba la tabla sin cargar. Un GET REST
// no tiene ese problema y las reglas permiten lectura pública de estos docs.
const FS = "https://firestore.googleapis.com/v1/projects/mundialisimo/databases/(default)/documents";

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

export async function fetchUsersRest(groupId: string): Promise<string[]> {
  try {
    const res = await fetch(`${FS}/groups/${groupId}/config/users`, { cache: "no-store" });
    if (res.ok) {
      const d = (await res.json()) as FsDoc;
      const list = strArray(d.fields?.list);
      if (list.length > 0) return list;
    }
  } catch { /* ignore */ }
  return groupId === DEFAULT_GROUP ? USERS : [];
}

export async function fetchBetsRest(groupId: string): Promise<BetDoc[]> {
  try {
    const res = await fetch(`${FS}/groups/${groupId}/bets`, { cache: "no-store" });
    if (!res.ok) return [];
    const d = (await res.json()) as { documents?: FsDoc[] };
    return (d.documents ?? []).map((doc) => ({
      user: doc.name.split("/").pop() ?? "",
      favorites: strArray(doc.fields?.favorites),
      antiFavorites: strArray(doc.fields?.antiFavorites),
      confirmed: doc.fields?.confirmed?.booleanValue ?? false,
    }));
  } catch {
    return [];
  }
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
