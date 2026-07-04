import { setDoc } from "firebase/firestore";
import { groupDoc } from "./db";
import { getGroupId } from "./group";
import { loadCachedValue, saveCachedValue, markQuotaExceeded } from "./fsread";

// Pronóstico de un partido de grupos: goles local y visitante.
export interface Score {
  h: number;
  a: number;
}

// results = marcadores imaginados para partidos de grupos no jugados.
export type Predictions = Record<string, Score>;
// knockout = marcador de cada cruce: { h, a, pen? }. pen = quién pasa si empate.
// penHome/penAway = goles de la tanda (solo cruces reales ya jugados).
export interface KoScore {
  h: number;
  a: number;
  pen?: "home" | "away";
  penHome?: number;
  penAway?: number;
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
// que es inestable en Safari. Si la lectura falla (p. ej. 429), devuelve la
// última copia local en vez de vaciar la simulación del usuario.
export async function fetchUserSim(user: string): Promise<UserSim> {
  const groupId = getGroupId();
  const cacheName = `sim_${user.toLowerCase()}`;
  try {
    const res = await fetch(`${FS}/groups/${groupId}/predictions/${user.toLowerCase()}`, { cache: "no-store" });
    if (!res.ok) {
      // Fallo (p. ej. 429): conservar lo último bueno si lo hay.
      if (res.status === 429) markQuotaExceeded();
      return loadCachedValue<UserSim>(cacheName) ?? { results: {}, knockout: {} };
    }
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
    const sim: UserSim = { results, knockout };
    // Guardar copia local solo si tiene contenido (no pisar una sim buena con vacío).
    if (Object.keys(results).length > 0 || Object.keys(knockout).length > 0) {
      saveCachedValue(cacheName, sim);
    }
    return sim;
  } catch {
    return loadCachedValue<UserSim>(cacheName) ?? { results: {}, knockout: {} };
  }
}

// Guarda la simulación completa del usuario (escritura puntual con el SDK).
export async function saveUserSim(user: string, sim: UserSim): Promise<void> {
  await setDoc(groupDoc("predictions", user.toLowerCase()), { ...sim, updatedAt: new Date() });
}
