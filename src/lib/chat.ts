import { notifyPush, leaderCheck } from "./push";
import { getGroupId } from "./group";

// Chat del grupo. El historial vive en el KV del Worker (no en Firestore): así
// LEER el chat cuesta 1 lectura sin importar cuántos mensajes haya, y no se
// agota la cuota de Firestore con el polling de muchos clientes. Las escrituras
// (enviar, reaccionar, borrar) pasan por el Worker.
const MATCHES_URL = process.env.NEXT_PUBLIC_LIVE_MATCHES_URL ?? "";
const CHAT_URL = MATCHES_URL ? MATCHES_URL.replace(/\/matches\/?$/, "/chat") : "";

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
  createdAt: number; // ms epoch
  reactions: Record<string, string[]>; // emoji -> lista de usuarios
}

function normalizeReactions(r: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (r && typeof r === "object") {
    for (const [emoji, users] of Object.entries(r as Record<string, unknown>)) {
      if (Array.isArray(users)) {
        const list = users.filter((u): u is string => typeof u === "string");
        if (list.length) out[emoji] = list;
      }
    }
  }
  return out;
}

// Lee los mensajes (a través del Worker; el KV es la fuente de verdad).
export async function fetchMessages(): Promise<ChatMessage[]> {
  if (!CHAT_URL) return [];
  try {
    const url = new URL(CHAT_URL);
    url.searchParams.set("group", getGroupId());
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { messages?: unknown[] };
    return (data.messages ?? []).map((raw): ChatMessage => {
      const m = raw as Partial<ChatMessage>;
      return {
        id: String(m.id ?? ""),
        user: String(m.user ?? ""),
        text: String(m.text ?? ""),
        createdAt: Number(m.createdAt ?? 0),
        reactions: normalizeReactions(m.reactions),
      };
    });
  } catch {
    return [];
  }
}

async function chatPost(body: Record<string, unknown>): Promise<unknown> {
  if (!CHAT_URL) return null;
  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group: getGroupId(), ...body }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}`);
  return res.json();
}

// Envía un mensaje y devuelve el mensaje creado (para pintarlo al instante).
export async function sendMessage(user: string, text: string): Promise<ChatMessage | null> {
  const clean = text.trim().slice(0, 500);
  if (!clean) return null;
  const res = (await chatPost({ action: "send", user, text: clean })) as { message?: ChatMessage } | null;
  return res?.message ?? null;
}

// Borra un mensaje (solo lo usa el admin desde la UI).
export async function deleteMessage(id: string): Promise<void> {
  await chatPost({ action: "delete", id });
}

// Alterna la reacción del usuario a un mensaje. Calcula el nuevo estado local y
// lo manda al Worker; devuelve el estado optimista para refrescar la UI ya.
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
  await chatPost({ action: "react", id, emoji, user });
  return next;
}

// Publica un mensaje automático de LaIA en el chat.
export async function postBotMessage(text: string): Promise<void> {
  const clean = text.trim().slice(0, 500);
  if (!clean) return;
  await chatPost({ action: "send", user: BOT_AUTHOR, text: clean });
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

