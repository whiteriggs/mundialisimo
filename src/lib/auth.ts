import { getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { groupDoc } from "./db";
import { getGroupId, DEFAULT_GROUP, GROUP_ALIASES } from "./group";

// Lista semilla solo para el grupo por defecto (amigos de Javi). Los grupos
// nuevos empiezan vacíos y su admin va añadiendo jugadores desde el panel.
export const USERS = ["Juan", "Javi", "Jordi", "Jorge", "Esteban", "Manuel", "JuanRa", "Adri", "Capde", "Iris", "Mariona", "Ester"];

export async function getUsers(): Promise<string[]> {
  try {
    const snap = await getDoc(groupDoc("config", "users"));
    if (snap.exists()) {
      const data = snap.data() as { list?: string[] };
      if (data.list && data.list.length > 0) return data.list;
    }
  } catch { /* ignore */ }
  return getGroupId() === DEFAULT_GROUP ? USERS : [];
}

export async function addUser(username: string): Promise<void> {
  const current = await getUsers();
  if (current.map((u) => u.toLowerCase()).includes(username.toLowerCase())) return;
  await setDoc(groupDoc("config", "users"), { list: [...current, username] });
}

export async function removeUser(username: string): Promise<void> {
  const current = await getUsers();
  await setDoc(groupDoc("config", "users"), {
    list: current.filter((u) => u.toLowerCase() !== username.toLowerCase()),
  });
}

export async function deleteUserPassword(username: string): Promise<void> {
  await deleteDoc(groupDoc("userPasswords", username.toLowerCase()));
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hasUserPassword(username: string): Promise<boolean> {
  const snap = await getDoc(groupDoc("userPasswords", username.toLowerCase()));
  return snap.exists();
}

export async function createUserPassword(username: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  await setDoc(groupDoc("userPasswords", username.toLowerCase()), {
    hash,
    createdAt: new Date(),
  });
}

export async function verifyUserPassword(username: string, password: string): Promise<boolean> {
  const snap = await getDoc(groupDoc("userPasswords", username.toLowerCase()));
  if (!snap.exists()) return false;
  const { hash } = snap.data() as { hash: string };
  return hash === (await hashPassword(password));
}

// La sesión se guarda por grupo, así "Javi" en un grupo no se cruza con otro.
function userKey(): string {
  return `mundialisimo_user_${getGroupId()}`;
}

export function getStoredUser(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(userKey());
  if (v) return v;
  // Migración de sesión tras renombrar el grupo (p.ej. javi -> papisllor):
  // recuperar la sesión guardada con el id antiguo.
  const current = getGroupId();
  for (const [oldId, target] of Object.entries(GROUP_ALIASES)) {
    if (target !== current) continue;
    const prev = localStorage.getItem(`mundialisimo_user_${oldId}`);
    if (prev) {
      localStorage.setItem(userKey(), prev);
      return prev;
    }
  }
  // Migración suave: sesión antigua global del grupo por defecto.
  if (getGroupId() === DEFAULT_GROUP) {
    const old = localStorage.getItem("mundialisimo_user");
    if (old) {
      localStorage.setItem(userKey(), old);
      return old;
    }
  }
  return null;
}

export function storeUser(name: string): void {
  localStorage.setItem(userKey(), name);
}

export function clearUser(): void {
  localStorage.removeItem(userKey());
}

