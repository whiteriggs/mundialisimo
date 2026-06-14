"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getStoredUser } from "@/lib/auth";
import { isGroupAdmin, getGroupId } from "@/lib/group";
import {
  fetchMessages,
  sendMessage,
  deleteMessage,
  toggleReaction,
  isBotAuthor,
  REACTION_EMOJIS,
  type ChatMessage,
} from "@/lib/chat";
import {
  isPushSupported,
  getPushEnabled,
  subscribeToPush,
  unsubscribeFromPush,
  notifyPush,
} from "@/lib/push";

function seenKey() {
  return `mundialisimo_chat_seen_${getGroupId()}`;
}

function getSeen(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(seenKey()) ?? "0");
}
function setSeen(ts: number) {
  try { localStorage.setItem(seenKey(), String(ts)); } catch { /* ignore */ }
}

function fmtTime(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("es-ES", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function ChatWidget() {
  const pathname = usePathname();
  const [user, setUser] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // No mostrar el chat en la pantalla de login (aunque haya sesión guardada).
  const onLogin = (pathname ?? "").includes("/login");

  useEffect(() => {
    setUser(getStoredUser());
    setLastSeen(getSeen());
    setPushOn(getPushEnabled());
  }, []);

  const admin = useMemo(() => isGroupAdmin(user), [user]);

  const load = useCallback(async () => {
    setMessages(await fetchMessages());
  }, []);

  // Polling: más frecuente con el chat abierto, más espaciado cerrado.
  useEffect(() => {
    if (!user || onLogin) return;
    load();
    const interval = setInterval(load, open ? 5000 : 15000);
    return () => clearInterval(interval);
  }, [user, open, load, onLogin]);

  // Recargar al volver a la pestaña.
  useEffect(() => {
    if (!user) return;
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [user, load]);

  const latestTs = messages.length ? messages[messages.length - 1].createdAt : 0;
  const unread = useMemo(
    () => messages.filter((m) => m.createdAt > lastSeen && m.user.toLowerCase() !== (user ?? "").toLowerCase()).length,
    [messages, lastSeen, user]
  );

  // Al abrir, marcar todo como leído y bajar al final.
  useEffect(() => {
    if (!open) return;
    if (latestTs) { setSeen(latestTs); setLastSeen(latestTs); }
    const el = listRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [open, latestTs]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || !user || sending) return;
    setSending(true);
    setDraft("");
    try {
      const msg = await sendMessage(user, text);
      if (msg) setMessages((prev) => [...prev, msg]);
      notifyPush({
        title: `💬 ${user}`,
        body: text.slice(0, 140),
        url: "/resultados/",
        tag: "chat",
        excludeUser: user,
      });
      const el = listRef.current;
      if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    } catch {
      setDraft(text); // restaurar si falla
    } finally {
      setSending(false);
    }
  }

  async function handleTogglePush() {
    if (!user || pushBusy) return;
    setPushBusy(true);
    try {
      if (pushOn) {
        await unsubscribeFromPush();
        setPushOn(false);
      } else {
        const ok = await subscribeToPush(user);
        setPushOn(ok);
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function handleReact(m: ChatMessage, emoji: string) {
    if (!user) return;
    setPickerFor(null);
    const updated = await toggleReaction(m.id, emoji, user, m.reactions);
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: updated } : x)));
  }

  async function handleDelete(id: string) {
    await deleteMessage(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  if (!user) return null;
  if (onLogin) return null;

  return (
    <>
      {open && (
        <div className="chat-card" role="dialog" aria-label="Chat del grupo">
          <div className="chat-head">
            <span className="chat-title">💬 Chat</span>
            {isPushSupported() && (
              <button
                className={`chat-bell${pushOn ? " chat-bell--on" : ""}`}
                onClick={handleTogglePush}
                disabled={pushBusy}
                aria-label={pushOn ? "Desactivar notificaciones" : "Activar notificaciones"}
                title={pushOn ? "Notificaciones activadas (toca para desactivar)" : "Activar notificaciones"}
              >
                {pushOn ? "🔔" : "🔕"}
              </button>
            )}
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="Cerrar chat">×</button>
          </div>
          <div className="chat-list" ref={listRef}>
            {messages.length === 0 ? (
              <p className="chat-empty">Sé el primero en escribir 👋</p>
            ) : (
              messages.map((m) => {
                const mine = m.user.toLowerCase() === user.toLowerCase();
                const bot = isBotAuthor(m.user);
                return (
                  <div key={m.id} className={`chat-msg${mine ? " chat-msg--mine" : ""}${bot ? " chat-msg--bot" : ""}`}>
                    <div className="chat-msg-head">
                      <span className="chat-msg-user">{bot ? "📣 LaIA" : m.user}</span>
                      <span className="chat-msg-time">{fmtTime(m.createdAt)}</span>
                      {admin && (
                        <button className="chat-msg-del" onClick={() => handleDelete(m.id)} title="Borrar mensaje">×</button>
                      )}
                    </div>
                    <div className="chat-msg-text">{m.text}</div>
                    <div className="chat-msg-foot">
                      {Object.entries(m.reactions).map(([emoji, users]) => (
                        <button
                          key={emoji}
                          className={`chat-reaction${users.includes(user) ? " chat-reaction--on" : ""}`}
                          onClick={() => handleReact(m, emoji)}
                          title={users.join(", ")}
                        >
                          {emoji} {users.length}
                        </button>
                      ))}
                      <div className="chat-react-wrap">
                        <button
                          className="chat-react-add"
                          onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                          aria-label="Añadir reacción"
                          title="Añadir reacción"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M9 10h.01M15 10h.01" />
                            <path d="M9.5 15a3.5 3.5 0 0 0 5 0" />
                          </svg>
                          <span className="chat-react-plus">+</span>
                        </button>
                        {pickerFor === m.id && (
                          <div className="chat-picker">
                            {REACTION_EMOJIS.map((e) => (
                              <button key={e} onClick={() => handleReact(m, e)}>{e}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="chat-input">
            <input
              type="text"
              value={draft}
              maxLength={500}
              placeholder="Escribe un mensaje…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            />
            <button onClick={handleSend} disabled={sending || !draft.trim()}>Enviar</button>
          </div>
        </div>
      )}

      <button
        className={`chat-chip${unread > 0 && !open ? " chat-chip--glow" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Abrir chat del grupo"
      >
        <span className="chat-chip-icon">💬</span>
        <span className="chat-chip-label">Chat</span>
        {unread > 0 && !open && <span className="chat-chip-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
    </>
  );
}
