import { setDoc } from "firebase/firestore";
import { groupDoc } from "./db";
import { getGroupId } from "./group";

// Pronóstico de un partido: goles local y visitante.
export interface Score {
  h: number;
  a: number;
}

// results = { [matchId]: { h, a } } con los marcadores que el usuario imagina
// para los partidos que aún no se han jugado.
export type Predictions = Record<string, Score>;

const FS = "https://firestore.googleapis.com/v1/projects/mundialisimo/databases/(default)/documents";

type FsValue = {
  integerValue?: string;
  mapValue?: { fields?: Record<string, FsValue> };
};

// Lee los pronósticos del usuario por REST (GET), evitando el WebChannel del SDK
// que es inestable en Safari.
export async function fetchPredictions(user: string): Promise<Predictions> {
  const groupId = getGroupId();
  try {
    const res = await fetch(`${FS}/groups/${groupId}/predictions/${user.toLowerCase()}`, { cache: "no-store" });
    if (!res.ok) return {};
    const data = (await res.json()) as { fields?: { results?: FsValue } };
    const fields = data.fields?.results?.mapValue?.fields ?? {};
    const out: Predictions = {};
    for (const [matchId, v] of Object.entries(fields)) {
      const f = v.mapValue?.fields ?? {};
      const h = Number(f.h?.integerValue ?? "0");
      const a = Number(f.a?.integerValue ?? "0");
      out[matchId] = { h, a };
    }
    return out;
  } catch {
    return {};
  }
}

// Guarda todos los pronósticos del usuario (escritura puntual con el SDK).
export async function savePredictions(user: string, results: Predictions): Promise<void> {
  await setDoc(groupDoc("predictions", user.toLowerCase()), { results, updatedAt: new Date() });
}
