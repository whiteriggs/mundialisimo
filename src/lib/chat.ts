import { addDoc, deleteDoc, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { groupCollection, groupDoc } from "./db";
import { notifyPush, leaderCheck } from "./push";
import { readCollection } from "./fsread";

// Chat del grupo. Patrón conocido del proyecto: escribir con el SDK (puntual,
// estable) y LEER por REST con polling, evitando el WebChannel del SDK que
// cuelga en Safari/redes móviles. Las lecturas de polling pasan por el Worker
// (cacheadas) para no quemar la cuota de Firestore.

export const REACTION_EMOJIS = ["👍", "😂", "🔥", "⚽", "😮", "😢"] as const;

// Autor de los mensajes automáticos (crónicas nuevas, cambios de líder).
export const BOT_AUTHOR = "LaIA";
export function isBotAuthor(user: string): boolean {
  return user === BOT_AUTHOR;
}

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

// Lee los mensajes ordenados por fecha ascendente (a través del Worker cacheado).
export async function fetchMessages(): Promise<ChatMessage[]> {
  const docs = (await readCollection("messages", { orderBy: "createdAt" })) as FsDoc[];
  return docs.map((doc): ChatMessage => {
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

// Publica un mensaje automático de LaIA en el chat.
export async function postBotMessage(text: string): Promise<void> {
  const clean = text.trim().slice(0, 500);
  if (!clean) return;
  await addDoc(groupCollection("messages"), {
    user: BOT_AUTHOR,
    text: clean,
    createdAt: serverTimestamp(),
    reactions: {},
  });
}

// Anuncia en el chat que se ha publicado una crónica nueva.
export async function announceChronicle(headline: string): Promise<void> {
  const h = headline.trim();
  await postBotMessage(
    h
      ? `📰 ¡Edición nueva! "${h}". Pásate por la pestaña Crónica para leerla entera. ✍️`
      : "📰 ¡Crónica nueva publicada! Pásate por la pestaña Crónica para leerla. ✍️"
  );
  await notifyPush({
    title: "📰 Mundialísimo · Crónica nueva",
    body: h ? `"${h}"` : "LaIA ha publicado una crónica nueva.",
    url: "/cronica/",
    tag: "cronica",
  });
}

// Detecta cambios de líder y los anuncia una sola vez. La DECISIÓN la toma el
// Worker (su KV es la única fuente estable: no parpadea con la API ni sufre
// carreras entre clientes). El cliente solo reporta el líder actual y, si el
// Worker dice que toca anunciar, escribe el mensaje y dispara el push.
export async function maybeAnnounceLeader(name: string, total: number): Promise<void> {
  if (!name) return;
  const { announce, prev } = await leaderCheck(name);
  if (!announce || !prev) return;
  await postBotMessage(
    `🚨 ¡Cambio de líder! ${name} adelanta a ${prev} y se pone primero con ${total} ${total === 1 ? "punto" : "puntos"}. 👑`
  );
  await notifyPush({
    title: "🚨 ¡Cambio de líder!",
    body: `${name} adelanta a ${prev} y se pone primero con ${total} ${total === 1 ? "punto" : "puntos"}.`,
    url: "/resultados/",
    tag: "lider",
  });
}

// ── Presencia ("en línea") ───────────────────────────────────────────────
// Cada cliente escribe un latido cada ~20s. Se considera en línea a quien lo
// haya hecho en los últimos ONLINE_WINDOW_MS.
export const ONLINE_WINDOW_MS = 45_000;

// Escribe el latido del usuario (setDoc con merge implícito vía set).
export async function pingPresence(user: string): Promise<void> {
  if (!user) return;
  await setDoc(groupDoc("presence", user.toLowerCase()), {
    user,
    lastSeen: serverTimestamp(),
  });
}

// Lee quién está en línea ahora mismo (a través del Worker cacheado).
export async function fetchOnline(): Promise<string[]> {
  const docs = (await readCollection("presence")) as FsDoc[];
  const now = Date.now();
  return docs
    .map((doc) => {
      const f = doc.fields ?? {};
      const ts = f.lastSeen?.timestampValue;
      return { user: f.user?.stringValue ?? "", ms: ts ? Date.parse(ts) : 0 };
    })
    .filter((p) => p.user && now - p.ms < ONLINE_WINDOW_MS)
    .map((p) => p.user);
}

// ── Recibos de lectura ("leído por N") ───────────────────────────────────
// Cada usuario guarda el timestamp del último mensaje que ha visto. Con eso se
// deriva, para cada mensaje, quién lo ha leído (su lastRead >= createdAt).
export async function markRead(user: string, ts: number): Promise<void> {
  if (!user || !ts) return;
  await setDoc(groupDoc("reads", user.toLowerCase()), {
    user,
    lastRead: ts,
  });
}

// Lee el último mensaje visto por cada usuario (a través del Worker cacheado).
export async function fetchReads(): Promise<Record<string, number>> {
  const docs = (await readCollection("reads")) as FsDoc[];
  const out: Record<string, number> = {};
  for (const doc of docs) {
    const f = doc.fields ?? {};
    const user = f.user?.stringValue ?? "";
    const lastRead = Number(f.lastRead?.integerValue ?? "0");
    if (user) out[user] = lastRead;
  }
  return out;
}

