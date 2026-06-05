import { collection, doc } from "firebase/firestore";
import { db } from "./firebase";
import { getGroupId } from "./group";

// Rutas Firestore acotadas al grupo activo: groups/{grupo}/{name}/...
// Úsalo para todo lo que sea "por grupo" (jugadores, contraseñas, apuestas,
// crónicas). Los resultados reales del Mundial (matches) son globales y siguen
// accediéndose con collection(db, "matches") directamente.
export function groupCollection(name: string) {
  return collection(db, "groups", getGroupId(), name);
}

export function groupDoc(name: string, id: string) {
  return doc(db, "groups", getGroupId(), name, id);
}
