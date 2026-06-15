import { getGroupId } from "./group";
import { loadCachedValue, saveCachedValue, markQuotaExceeded } from "./fsread";
import type { LeaderboardRow } from "./leaderboard";

// Lee las crónicas por REST (GET normal), NO con el SDK de Firestore. El SDK usa
// WebChannel, que falla de forma intermitente en Safari/redes móviles y dejaba la
// página de crónica colgada en "Cargando…". Un GET REST no tiene ese problema.
const FS = "https://firestore.googleapis.com/v1/projects/mundialisimo/databases/(default)/documents";

export interface ChronicleEntry {
  id: string; // YYYY-MM-DD
  text: string;
  leaderboard?: LeaderboardRow[];
}

type FsValue = {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  mapValue?: { fields?: Record<string, FsValue> };
  arrayValue?: { values?: FsValue[] };
};
type FsDoc = { name: string; fields?: Record<string, FsValue> };

function parseLeaderboard(v?: FsValue): LeaderboardRow[] | undefined {
  const vals = v?.arrayValue?.values;
  if (!vals) return undefined;
  return vals.map((item) => {
    const f = item.mapValue?.fields ?? {};
    return {
      user: f.user?.stringValue ?? "",
      total: Number(f.total?.integerValue ?? "0"),
      confirmed: f.confirmed?.booleanValue ?? false,
    };
  });
}

export async function fetchChronicles(): Promise<ChronicleEntry[]> {
  const groupId = getGroupId();
  try {
    const res = await fetch(`${FS}/groups/${groupId}/chronicles?pageSize=300`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { documents?: FsDoc[] };
      const entries = (data.documents ?? [])
        .map((doc): ChronicleEntry => {
          const id = doc.name.split("/").pop() ?? "";
          const f = doc.fields ?? {};
          return {
            id,
            text: f.text?.stringValue ?? "",
            leaderboard: parseLeaderboard(f.leaderboard),
          };
        })
        .filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.id) && c.text)
        .sort((a, b) => b.id.localeCompare(a.id));
      if (entries.length > 0) {
        saveCachedValue("chronicles", entries);
        return entries;
      }
    } else if (res.status === 429) {
      markQuotaExceeded();
    }
  } catch {
    /* sin red o error: usar copia local */
  }
  // Fallo (p. ej. 429) o vacío: devolver la última copia buena conocida.
  return loadCachedValue<ChronicleEntry[]>("chronicles") ?? [];
}
