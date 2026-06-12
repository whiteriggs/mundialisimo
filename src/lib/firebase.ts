import { initializeApp, getApps } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDI8krdmNN46J1gmsfSYpntsDD-iKP0ii8",
  authDomain: "mundialisimo.firebaseapp.com",
  projectId: "mundialisimo",
  storageBucket: "mundialisimo.firebasestorage.app",
  messagingSenderId: "375614678452",
  appId: "1:375614678452:web:51b4da8fc858d6452abee1"
};

const isNew = getApps().length === 0;
const app = isNew ? initializeApp(firebaseConfig) : getApps()[0];

// `experimentalAutoDetectLongPolling`: el transporte WebChannel por defecto de
// Firestore lo bloquean algunas redes móviles / Chrome Android (modo ahorro de
// datos, proxys), dejando las lecturas colgadas — síntoma típico: en iOS y web
// funciona, en Android no cargan los datos. Con esto, el SDK detecta el fallo y
// cae a long-polling (HTTP normal), que sí atraviesa esas redes.
export const db = isNew
  ? initializeFirestore(app, { experimentalAutoDetectLongPolling: true })
  : getFirestore(app);
