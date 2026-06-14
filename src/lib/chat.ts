import { addDoc, deleteDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { groupCollection, groupDoc } from "./db";
import { getGroupId } from "./group";

// Chat del grupo. Patrón conocido del proyecto: escribir con el SDK (puntual,
// estable) y LEER por REST con polling, evitando el WebChannel del SDK que
// cuelga en Safari/redes móviles.
const FS = "https://firestore.googleapis.com/v1/projects/mundialisimo/databases/(default)/documents";

export const REACTION_EMOJIS = ["👍", "😂", "🔥", "⚽", "😮", "😢"] as const;

export interface ChatMessage {
  id: string;
  user: string;
  text: string;
  createdAt: number; // ms epoch (0 si aún sin confirmar el server timestamp)
  reactions: Record<string, string[]>; // emoji -> lista de usuarios
}

type FsValue = {
  stringValue?: string;
  integerValue?: string;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, FsValue> };
  arrayValue?: { values?: FsValue[] };
};
type FsDoc = { name: string; fields?: Record<string, FsValue> };

function parseReactions(v?: FsValue): Record<string, string[]> {
  const fields = v?.mapValue?.fields ?? {};
  const out: Record<string, string[]> = {};
  for (const [emoji, val] of Object.entries(fields)) {
    const users = (val.arrayValue?.values ?? [])
      .map((u) => u.stringValue ?? "")
      .filter(Boolean);
    if (users.length) out[emoji] = users;
  }
  return out;
}

// Lee los mensajes ordenados por fecha ascendente (REST GET).
export async function fetchMessages(): Promise<ChatMessage[]> {
  const groupId = getGroupId();
  try {
    const res = await fetch(
      `${FS}/groups/${groupId}/messages?pageSize=300&orderBy=createdAt`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { documents?: FsDoc[] };
    return (data.documents ?? []).map((doc): ChatMessage => {
      const id = doc.name.split("/").pop() ?? "";
      const f = doc.fields ?? {};
      const ts = f.createdAt?.timestampValue;
      return {
        id,
        user: f.user?.stringValue ?? "",
        text: f.text?.stringValue ?? "",
        createdAt: ts ? Date.parse(ts) : 0,
        reactions: parseReactions(f.reactions),
      };
    });
  } catch {
    return [];
  }
}

// Envía un mensaje (escritura con el SDK).
export async function sendMessage(user: string, text: string): Promise<void> {
  const clean = text.trim().slice(0, 500);
  if (!clean) return;
  await addDoc(groupCollection("messages"), {
    user,
    text: clean,
    createdAt: serverTimestamp(),
    reactions: {},
  });
}

// Borra un mensaje (solo lo usa el admin desde la UI).
export async function deleteMessage(id: string): Promise<void> {
  await deleteDoc(groupDoc("messages", id));
}

// Alterna la reacción del usuario a un mensaje. Lee el estado actual desde la
// copia en memoria y reescribe solo el mapa de reacciones.
export async function toggleReaction(
  id: string,
  emoji: string,
  user: string,
  current: Record<string, string[]>
): Promise<Record<string, string[]>> {
  const next: Record<string, string[]> = {};
  for (const [e, users] of Object.entries(current)) next[e] = [...users];
  const list = next[emoji] ?? [];
  next[emoji] = list.includes(user) ? list.filter((u) => u !== user) : [...list, user];
  if (next[emoji].length === 0) delete next[emoji];
  await updateDoc(groupDoc("messages", id), { reactions: next });
  return next;
}
