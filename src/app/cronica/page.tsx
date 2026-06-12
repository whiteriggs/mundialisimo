"use client";

import { useEffect, useState } from "react";
import { getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { groupCollection } from "@/lib/db";
import NavBar from "@/components/NavBar";
import { getStoredUser, clearUser } from "@/lib/auth";
import { parseChronicle } from "@/lib/chronicle";

interface ChronicleEntry {
  id: string; // YYYY-MM-DD
  text: string;
  generatedAt: { seconds: number } | Date;
}

export default function CronicaPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [chronicles, setChronicles] = useState<ChronicleEntry[]>([]);
  const [index, setIndex] = useState(0); // 0 = más reciente
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.push("/login"); return; }
    setUser(u);
    async function load() {
      try {
        const snap = await getDocs(groupCollection("chronicles"));
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
  }, [router]);

  function handleLogout() {
    clearUser();
    router.push("/login");
  }

  const chronicle = chronicles[index];

  function formatId(id: string) {
    const [y, m, d] = id.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  }

  const parsed = chronicle ? parseChronicle(chronicle.text) : null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialisimo</h1>
          <span className="sub">Crónica</span>
        </div>
        <NavBar user={user} />
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">📰</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Mundial 2026 · Reportera LaIA</div>
            <h2 className="hero-name">Crónica de la Porra</h2>
            <p className="lead">La jornada y el power ranking, por LaIA, nuestra reportera con muy mala leche.</p>
          </div>
        </div>
      </section>

      <section className="content-section">
        {loading ? (
          <div className="card" style={{ maxWidth: 720, margin: "0 auto" }}>
            <p className="muted">Cargando…</p>
          </div>
        ) : chronicles.length === 0 ? (
          <div className="card" style={{ maxWidth: 720, margin: "0 auto" }}>
            <p className="muted">Aún no hay crónica. El admin generará la primera en breve.</p>
          </div>
        ) : (
          <>
            <div className="cronica-nav">
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

            {parsed ? (
              <article className="newspaper">
                <div className="np-masthead">
                  <span className="np-edition">Edición especial</span>
                  <h1 className="np-title">El Mundialísimo</h1>
                  <span className="np-date">{formatId(chronicle.id)} · Crónica de LaIA</span>
                </div>
                <div className="np-rule" />

                <h2 className="np-headline">{parsed.headline}</h2>
                {parsed.standfirst && <p className="np-standfirst">{parsed.standfirst}</p>}

                {parsed.body.length > 0 && (
                  <div className="np-body">
                    {parsed.body.map((p, i) => (
                      <p key={i} className={i === 0 ? "np-lead-para" : undefined}>{p}</p>
                    ))}
                  </div>
                )}

                {parsed.ranking.length > 0 && (
                  <div className="np-ranking">
                    <h3 className="np-section-title">⚖️ El veredicto de la porra</h3>
                    <ol className="np-ranking-list">
                      {parsed.ranking.map((r) => (
                        <li key={r.pos} className="np-ranking-item">
                          <span className="np-rank-pos">{r.pos}</span>
                          <span className="np-rank-body">
                            <strong className="np-rank-name">{r.name}</strong>
                            <span className="np-rank-comment">{r.comment}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <div className="np-footer">Redacción: LaIA · Corresponsal con mala leche cariñosa</div>
              </article>
            ) : (
              <div className="card" style={{ maxWidth: 720, margin: "0 auto" }}>
                <div className="chronicle-text">
                  {chronicle.text.split("\n").map((line, i) =>
                    line.trim() ? <p key={i} style={{ margin: "0.3rem 0" }}>{line}</p> : <br key={i} />
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
