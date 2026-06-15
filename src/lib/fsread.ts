import { getGroupId } from "./group";

// Lectura de colecciones de grupo a través del Worker (cacheada en el edge) en
// vez de pegar directamente a Firestore. Motivo: el polling de 13 clientes cada
// pocos segundos agota la cuota de lecturas del plan gratuito de Firestore. El
// Worker lee Firestore UNA vez por ventana de caché y sirve a todos.
//
// Devuelve el MISMO formato que la REST de Firestore ({ documents: [...] }) para
// que los parseos existentes no cambien. Si el Worker no está configurado o
// falla, cae a la REST directa de Firestore (degradado).
const FS = "https://firestore.googleapis.com/v1/projects/mundialisimo/databases/(default)/documents";
const MATCHES_URL = process.env.NEXT_PUBLIC_LIVE_MATCHES_URL ?? "";
const READ_URL = MATCHES_URL ? MATCHES_URL.replace(/\/matches\/?$/, "/read") : "";

export interface FsDocRaw {
  name: string;
  fields?: Record<string, unknown>;
}

// Copia local de la última lectura BUENA por grupo+colección. Sirve de red de
// seguridad: si Firestore da error (p. ej. 429 "cuota agotada"), devolvemos la
// última copia conocida en vez de vaciar la tabla de clasificación.
function cacheKey(groupId: string, col: string) {
  return `mundialisimo_cache_${groupId}_${col}`;
}
function readCache(groupId: string, col: string): FsDocRaw[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(groupId, col));
    if (!raw) return null;
    const arr = JSON.parse(raw) as FsDocRaw[];
    return Array.isArray(arr) && arr.length > 0 ? arr : null;
  } catch {
    return null;
  }
}
function writeCache(groupId: string, col: string, docs: FsDocRaw[]) {
  if (typeof window === "undefined" || docs.length === 0) return;
  try {
    localStorage.setItem(cacheKey(groupId, col), JSON.stringify(docs));
  } catch {
    /* localStorage lleno/no disponible: ignorar */
  }
}

// ── Caché genérica de valores ya parseados ───────────────────────────────
// Para lecturas que NO devuelven el formato { documents: [] } (crónicas,
// simulación del usuario…). Guarda la última versión buena y la devuelve si una
// lectura posterior falla (p. ej. 429 "cuota agotada"), para no vaciar la UI.
function valueKey(name: string) {
  return `mundialisimo_vcache_${getGroupId()}_${name}`;
}
export function loadCachedValue<T>(name: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(valueKey(name));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function saveCachedValue<T>(name: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(valueKey(name), JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

// Colecciones cuyo polling movemos al Worker. orderBy opcional.
export async function readCollection(
  col: string,
  opts: { orderBy?: string; pageSize?: number } = {}
): Promise<FsDocRaw[]> {
  const groupId = getGroupId();
  const { orderBy, pageSize = col === "messages" ? 300 : 200 } = opts;

  if (READ_URL) {
    try {
      const u = new URL(READ_URL);
      u.searchParams.set("group", groupId);
      u.searchParams.set("col", col);
      if (orderBy) u.searchParams.set("orderBy", orderBy);
      const res = await fetch(u.toString(), { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { documents?: FsDocRaw[] };
        const docs = data.documents ?? [];
        if (docs.length > 0) {
          writeCache(groupId, col, docs);
          return docs;
        }
        // Respuesta vacía: puede ser un glitch o un 200 sin datos. Si tenemos
        // una copia buena previa, preferimos no vaciar la pantalla.
        const cached = readCache(groupId, col);
        if (cached) return cached;
        return docs;
      }
      // 429 u otros: caemos al fallback directo de abajo.
    } catch {
      /* fallback */
    }
  }

  // Fallback: REST directa de Firestore.
  try {
    let url = `${FS}/groups/${groupId}/${col}?pageSize=${pageSize}`;
    if (orderBy) url += `&orderBy=${orderBy}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { documents?: FsDocRaw[] };
      const docs = data.documents ?? [];
      if (docs.length > 0) {
        writeCache(groupId, col, docs);
        return docs;
      }
      const cached = readCache(groupId, col);
      if (cached) return cached;
      return docs;
    }
  } catch {
    /* sin red o error: usar copia local */
  }

  // Todo ha fallado (incluido 429): devolver la última copia buena conocida.
  return readCache(groupId, col) ?? [];
}

