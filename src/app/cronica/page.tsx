"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import NavBar from "@/components/NavBar";
import { getStoredUser } from "@/lib/auth";

interface Chronicle {
  text: string;
  generatedAt: { seconds: number } | Date;
  generatedBy: string;
}

export default function CronicaPage() {
  const [user, setUser] = useState<string | null>(null);
  const [chronicle, setChronicle] = useState<Chronicle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getStoredUser());
    async function load() {
      try {
        const snap = await getDoc(doc(db, "chronicles", "latest"));
        if (snap.exists()) setChronicle(snap.data() as Chronicle);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const generatedDate = chronicle?.generatedAt
    ? (() => {
        const ts = chronicle.generatedAt;
        const d = "seconds" in ts ? new Date(ts.seconds * 1000) : new Date(ts);
        return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
      })()
    : null;

  return (
    <>
      <NavBar user={user} />
      <main className="page-main">
        <div className="card" style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{ marginBottom: "0.25rem" }}>Crónica de la Porra</h1>
          {generatedDate && (
            <p className="muted" style={{ marginBottom: "1.5rem", fontSize: "0.85rem" }}>
              Generada el {generatedDate}
            </p>
          )}

          {loading ? (
            <p className="muted">Cargando…</p>
          ) : !chronicle ? (
            <p className="muted">Aún no hay crónica. El admin generará la primera en breve.</p>
          ) : (
            <div className="chronicle-text">
              {chronicle.text.split("\n").map((line, i) =>
                line.trim() ? <p key={i} style={{ margin: "0.3rem 0" }}>{line}</p> : <br key={i} />
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
