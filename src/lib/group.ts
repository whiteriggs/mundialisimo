// Multi-grupo: cada "grupo" es una porra independiente con sus propios
// jugadores, contraseñas, apuestas y crónicas. Los resultados (matches) son
// globales porque el Mundial es el mismo para todos.
//
// Para pasar a la "Opción C" (crear/elegir grupos desde la UI) bastaría con
// mover este registro a Firestore: el resto del código accede a los datos a
// través de getGroupId() y los helpers de @/lib/db, que ya están desacoplados.

export interface GroupConfig {
  label: string;
  admin: string; // username con acceso al panel Admin (case-insensitive)
}

export const GROUPS: Record<string, GroupConfig> = {
  javi: { label: "Papis Llor", admin: "Javi" },
  brain2store: { label: "Brain2Store", admin: "JN" },
};

export const DEFAULT_GROUP = "javi";
const GROUP_KEY = "mundialisimo_group";

/**
 * Grupo activo. Se puede fijar con `?grupo=<id>` en la URL (queda persistido en
 * localStorage), si no se usa el último guardado, y como último recurso el
 * grupo por defecto.
 */
export function getGroupId(): string {
  if (typeof window === "undefined") return DEFAULT_GROUP;
  try {
    const q = new URLSearchParams(window.location.search).get("grupo");
    if (q && GROUPS[q]) {
      localStorage.setItem(GROUP_KEY, q);
      return q;
    }
  } catch {
    /* localStorage/URL no disponible */
  }
  try {
    const stored = localStorage.getItem(GROUP_KEY);
    if (stored && GROUPS[stored]) return stored;
  } catch {
    /* localStorage no disponible */
  }
  return DEFAULT_GROUP;
}

export function getGroupConfig(): GroupConfig {
  return GROUPS[getGroupId()] ?? GROUPS[DEFAULT_GROUP];
}

export function setGroupId(id: string): void {
  if (typeof window === "undefined" || !GROUPS[id]) return;
  try {
    localStorage.setItem(GROUP_KEY, id);
  } catch {
    /* localStorage no disponible */
  }
}

export function isGroupAdmin(user: string | null): boolean {
  if (!user) return false;
  return user.toLowerCase() === getGroupConfig().admin.toLowerCase();
}
