"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import NavBar from "@/components/NavBar";
import { getStoredUser } from "@/lib/auth";

interface ChronicleEntry {
  id: string; // YYYY-MM-DD
  text: string;
  generatedAt: { seconds: number } | Date;
}

export default function CronicaPage() {
  const [user, setUser] = useState<string | null>(null);
  const [chronicles, setChronicles] = useState<ChronicleEntry[]>([]);
  const [index, setIndex] = useState(0); // 0 = más reciente
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getStoredUser());
    async function load() {
      try {
        const snap = await getDocs(collection(db, "chronicles"));
        const entries: ChronicleEntry[] = snap.docs
          .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.id))
          .map(d => ({ id: d.id, ...(d.data() as Omit<ChronicleEntry, "id">) }))
          .sort((a, b) => b.id.localeCompare(a.id));
        setChronicles(entries);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const chronicle = chronicles[index];

  function formatId(id: string) {
    const [y, m, d] = id.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  }

  return (
    <>
      <NavBar user={user} />
      <main className="page-main">
        <div className="card" style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{ marginBottom: "1rem" }}>Crónica de la Porra</h1>

          {loading ? (
            <p className="muted">Cargando…</p>
          ) : chronicles.length === 0 ? (
            <p className="muted">Aún no hay crónica. El admin generará la primera en breve.</p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
                <button
                  className="btn"
                  style={{ padding: "0.25rem 0.75rem" }}
                  onClick={() => setIndex(i => i + 1)}
                  disabled={index >= chronicles.length - 1}
                >
                  ←
                </button>
                <span className="muted" style={{ flex: 1, textAlign: "center", fontSize: "0.85rem" }}>
                  {formatId(chronicle.id)}{index === 0 ? " · Última" : ""}
                </span>
                <button
                  className="btn"
                  style={{ padding: "0.25rem 0.75rem" }}
                  onClick={() => setIndex(i => i - 1)}
                  disabled={index === 0}
                >
                  →
                </button>
              </div>
              <div className="chronicle-text">
                {chronicle.text.split("\n").map((line, i) =>
                  line.trim() ? <p key={i} style={{ margin: "0.3rem 0" }}>{line}</p> : <br key={i} />
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
