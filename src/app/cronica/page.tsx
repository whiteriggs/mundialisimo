"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import { getStoredUser, clearUser } from "@/lib/auth";
import NewspaperChronicle from "@/components/NewspaperChronicle";
import { fetchChronicles, type ChronicleEntry } from "@/lib/chronicles";
import { fetchLeaderboard, type LeaderboardRow } from "@/lib/leaderboard";

export default function CronicaPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [chronicles, setChronicles] = useState<ChronicleEntry[]>([]);
  const [index, setIndex] = useState(0); // 0 = más reciente
  const [loading, setLoading] = useState(true);
  const [liveBoard, setLiveBoard] = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.push("/login"); return; }
    setUser(u);
    fetchChronicles()
      .then(setChronicles)
      .catch(() => setChronicles([]))
      .finally(() => setLoading(false));
    // Clasificación actual de respaldo, por si la crónica no la trae guardada.
    fetchLeaderboard().then(setLiveBoard).catch(() => setLiveBoard([]));
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

            <NewspaperChronicle
              text={chronicle.text}
              dateLabel={formatId(chronicle.id)}
              leaderboard={chronicle.leaderboard ?? liveBoard}
            />
          </>
        )}
      </section>
    </main>
  );
}
