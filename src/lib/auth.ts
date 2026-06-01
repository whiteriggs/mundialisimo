import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";

export const USERS = ["Juan", "Javi", "Jordi", "Jorge", "Esteban", "Manuel", "JuanRa", "Adri", "Capde", "Iris", "Mariona", "Ester"];

export async function getUsers(): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, "config", "users"));
    if (snap.exists()) {
      const data = snap.data() as { list?: string[] };
      if (data.list && data.list.length > 0) return data.list;
    }
  } catch { /* ignore */ }
  return USERS;
}

export async function addUser(username: string): Promise<void> {
  const current = await getUsers();
  if (current.map((u) => u.toLowerCase()).includes(username.toLowerCase())) return;
  await setDoc(doc(db, "config", "users"), { list: [...current, username] });
}

export async function removeUser(username: string): Promise<void> {
  const current = await getUsers();
  await setDoc(doc(db, "config", "users"), {
    list: current.filter((u) => u.toLowerCase() !== username.toLowerCase()),
  });
}

export async function deleteUserPassword(username: string): Promise<void> {
  await deleteDoc(doc(db, "userPasswords", username.toLowerCase()));
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hasUserPassword(username: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "userPasswords", username.toLowerCase()));
  return snap.exists();
}

export async function createUserPassword(username: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  await setDoc(doc(db, "userPasswords", username.toLowerCase()), {
    hash,
    createdAt: new Date(),
  });
}

export async function verifyUserPassword(username: string, password: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "userPasswords", username.toLowerCase()));
  if (!snap.exists()) return false;
  const { hash } = snap.data() as { hash: string };
  return hash === (await hashPassword(password));
}

export function getStoredUser(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mundialisimo_user");
}

export function storeUser(name: string): void {
  localStorage.setItem("mundialisimo_user", name);
}

export function clearUser(): void {
  localStorage.removeItem("mundialisimo_user");
}

