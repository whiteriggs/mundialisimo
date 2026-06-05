// Migra los datos actuales (estructura plana de un solo grupo) a la estructura
// multi-grupo: groups/<grupo>/...  Copia (no borra) los documentos originales,
// así es seguro y se puede ejecutar más de una vez.
//
// Uso:
//   node scripts/migrate-to-groups.mjs            -> migra a groups/javi
//   node scripts/migrate-to-groups.mjs jordi      -> migra a groups/jordi
//
// Los resultados del Mundial (colección "matches") son globales y NO se migran.

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDI8krdmNN46J1gmsfSYpntsDD-iKP0ii8",
  authDomain: "mundialisimo.firebaseapp.com",
  projectId: "mundialisimo",
  storageBucket: "mundialisimo.firebasestorage.app",
  messagingSenderId: "375614678452",
  appId: "1:375614678452:web:51b4da8fc858d6452abee1",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const GROUP = process.argv[2] || "javi";

async function main() {
  console.log(`Migrando datos a groups/${GROUP} ...`);

  // config/users (documento único)
  const usersSnap = await getDoc(doc(db, "config", "users"));
  if (usersSnap.exists()) {
    await setDoc(doc(db, "groups", GROUP, "config", "users"), usersSnap.data());
    console.log("  ✓ config/users");
  } else {
    console.log("  – config/users no existe, omitido");
  }

  // Colecciones por usuario / por fecha
  for (const col of ["userPasswords", "bets", "chronicles"]) {
    const snap = await getDocs(collection(db, col));
    let n = 0;
    for (const d of snap.docs) {
      await setDoc(doc(db, "groups", GROUP, col, d.id), d.data());
      n++;
    }
    console.log(`  ✓ ${col}: ${n} documentos`);
  }

  console.log(`Migración completa → groups/${GROUP}`);
  console.log("Los documentos originales NO se han borrado (revísalo y bórralos a mano si quieres).");
  process.exit(0);
}

main().catch((e) => {
  console.error("Error en la migración:", e);
  process.exit(1);
});
