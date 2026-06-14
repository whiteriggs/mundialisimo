import { setDoc, deleteDoc } from "firebase/firestore";
import { groupDoc } from "./db";
import { getGroupId } from "./group";

// Notificaciones push (opt-in). El cliente se suscribe con el navegador, guarda
// la suscripción en Firestore y el Worker hace el fan-out cifrado. La clave
// pública VAPID NO es secreta (identifica al emisor); la privada vive en el
// Worker como secret.
const VAPID_PUBLIC_KEY = "BEtPn4ygVuDfoFqrpX6x-CQp567x4gvUygbTpps9V7I4uZChXl2NadMJbkaeqzHmmXyhezrpAyIrmhvAAP7qeMM";

const MATCHES_URL = process.env.NEXT_PUBLIC_LIVE_MATCHES_URL ?? "";
const NOTIFY_URL = MATCHES_URL ? MATCHES_URL.replace(/\/matches\/?$/, "/notify") : "";
const LEADER_URL = MATCHES_URL ? MATCHES_URL.replace(/\/matches\/?$/, "/leader-check") : "";

export interface NotifyPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  excludeUser?: string;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function localKey() {
  return `mundialisimo_push_${getGroupId()}`;
}

// "Activado" según nuestra preferencia local + permiso del sistema concedido.
export function getPushEnabled(): boolean {
  if (!isPushSupported()) return false;
  try {
    return localStorage.getItem(localKey()) === "on" && Notification.permission === "granted";
  } catch {
    return false;
  }
}

function urlB64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToB64url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function endpointId(endpoint: string): Promise<string> {
  const data = new TextEncoder().encode(endpoint);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bufToB64url(hash).slice(0, 32).replace(/[^A-Za-z0-9_-]/g, "");
}

// Pide permiso y suscribe este dispositivo. Devuelve true si quedó activo.
export async function subscribeToPush(user: string): Promise<boolean> {
  if (!isPushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }

  const json = sub.toJSON();
  const endpoint = sub.endpoint;
  const id = await endpointId(endpoint);
  await setDoc(groupDoc("pushSubs", id), {
    user,
    endpoint,
    p256dh: json.keys?.p256dh ?? bufToB64url(sub.getKey("p256dh")),
    auth: json.keys?.auth ?? bufToB64url(sub.getKey("auth")),
    updatedAt: new Date(),
  });

  try { localStorage.setItem(localKey(), "on"); } catch { /* ignore */ }
  return true;
}

// Desactiva las notificaciones en este dispositivo (borra la suscripción).
export async function unsubscribeFromPush(): Promise<void> {
  try { localStorage.setItem(localKey(), "off"); } catch { /* ignore */ }
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const id = await endpointId(sub.endpoint);
      await deleteDoc(groupDoc("pushSubs", id)).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch { /* ignore */ }
}

// Pide al Worker que envíe una notificación a los demás miembros del grupo.
export async function notifyPush(payload: NotifyPayload): Promise<void> {
  if (!NOTIFY_URL) return;
  try {
    await fetch(NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: getGroupId(), ...payload }),
      keepalive: true,
    });
  } catch { /* el envío es best-effort; no romper la UX si falla */ }
}

// Pregunta al Worker (autoridad estable) si hay que anunciar un cambio de líder.
// El estado vive en el KV del Worker, inmune a los parpadeos de la API.
export async function leaderCheck(name: string): Promise<{ announce: boolean; prev: string | null }> {
  if (!LEADER_URL) return { announce: false, prev: null };
  try {
    const res = await fetch(LEADER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: getGroupId(), name }),
    });
    if (!res.ok) return { announce: false, prev: null };
    const d = (await res.json()) as { announce?: boolean; prev?: string | null };
    return { announce: !!d.announce, prev: d.prev ?? null };
  } catch {
    return { announce: false, prev: null };
  }
}
