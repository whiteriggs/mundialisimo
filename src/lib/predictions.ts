import { setDoc } from "firebase/firestore";
import { groupDoc } from "./db";
import { getGroupId } from "./group";

// Pronóstico de un partido de grupos: goles local y visitante.
export interface Score {
  h: number;
  a: number;
}

// results = marcadores imaginados para partidos de grupos no jugados.
export type Predictions = Record<string, Score>;
// knockout = marcador de cada cruce: { h, a, pen? }. pen = quién pasa si empate.
export interface KoScore {
  h: number;
  a: number;
  pen?: "home" | "away";
}
export type KnockoutScores = Record<string, KoScore>;

export interface UserSim {
  results: Predictions;
  knockout: KnockoutScores;
}

const FS = "https://firestore.googleapis.com/v1/projects/mundialisimo/databases/(default)/documents";

type FsValue = {
  stringValue?: string;
  integerValue?: string;
  mapValue?: { fields?: Record<string, FsValue> };
};

// Lee la simulación del usuario por REST (GET), evitando el WebChannel del SDK
// que es inestable en Safari.
export async function fetchUserSim(user: string): Promise<UserSim> {
  const groupId = getGroupId();
  const empty: UserSim = { results: {}, knockout: {} };
  try {
    const res = await fetch(`${FS}/groups/${groupId}/predictions/${user.toLowerCase()}`, { cache: "no-store" });
    if (!res.ok) return empty;
    const data = (await res.json()) as { fields?: { results?: FsValue; knockout?: FsValue } };
    const resultsFields = data.fields?.results?.mapValue?.fields ?? {};
    const results: Predictions = {};
    for (const [matchId, v] of Object.entries(resultsFields)) {
      const f = v.mapValue?.fields ?? {};
      results[matchId] = { h: Number(f.h?.integerValue ?? "0"), a: Number(f.a?.integerValue ?? "0") };
    }
    const koFields = data.fields?.knockout?.mapValue?.fields ?? {};
    const knockout: KnockoutScores = {};
    for (const [matchId, v] of Object.entries(koFields)) {
      const f = v.mapValue?.fields ?? {};
      const pen = f.pen?.stringValue;
      knockout[matchId] = {
        h: Number(f.h?.integerValue ?? "0"),
        a: Number(f.a?.integerValue ?? "0"),
        ...(pen === "home" || pen === "away" ? { pen } : {}),
      };
    }
    return { results, knockout };
  } catch {
    return empty;
  }
}

// Guarda la simulación completa del usuario (escritura puntual con el SDK).
export async function saveUserSim(user: string, sim: UserSim): Promise<void> {
  await setDoc(groupDoc("predictions", user.toLowerCase()), { ...sim, updatedAt: new Date() });
}
