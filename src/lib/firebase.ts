import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDI8krdmNN46J1gmsfSYpntsDD-iKP0ii8",
  authDomain: "mundialisimo.firebaseapp.com",
  projectId: "mundialisimo",
  storageBucket: "mundialisimo.firebasestorage.app",
  messagingSenderId: "375614678452",
  appId: "1:375614678452:web:51b4da8fc858d6452abee1"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
