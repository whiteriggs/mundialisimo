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
        return data.documents ?? [];
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
    if (!res.ok) return [];
    const data = (await res.json()) as { documents?: FsDocRaw[] };
    return data.documents ?? [];
  } catch {
    return [];
  }
}
