"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getStoredUser, clearUser, USERS } from "@/lib/auth";
import { TEAMS, teamName } from "@/lib/teams";

type BetDoc = {
  user: string;
  favorites: string[];
  antiFavorites: string[];
  confirmed: boolean;
};

function ticketCost(favorites: string[], antiFavorites: string[]) {
  const price = (id: string) => TEAMS.find((t) => t.id === id)?.price ?? 0;
  return favorites.reduce((s, id) => s + price(id), 0) -
    antiFavorites.reduce((s, id) => s + price(id), 0);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ApuestasPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [bets, setBets] = useState<BetDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { router.push("/login"); return; }
    setCurrentUser(user);

    async function load() {
      try {
        const snap = await getDocs(collection(db, "bets"));
        const data: BetDoc[] = snap.docs.map((d) => {
          const raw = d.data() as Partial<Omit<BetDoc, "user">>;
          return {
            user: d.id,
            favorites: raw.favorites ?? [],
            antiFavorites: raw.antiFavorites ?? [],
            confirmed: raw.confirmed ?? false,
          };
        });
        data.sort((a, b) => {
          if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;
          return a.user.localeCompare(b.user, "es");
        });
        setBets(data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  // Show all 7 users, including those who haven't saved yet
  const betMap = Object.fromEntries(bets.map((b) => [b.user, b]));
  const allUsers = USERS.map((u) => u.toLowerCase());

  function handleLogout() {
    clearUser();
    router.push("/login");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialisimo</h1>
          <span className="sub">Apuestas</span>
        </div>
        <nav className="topbar-nav">
          <Link href="/apuesta">Mi apuesta</Link>
          <Link href="/grupos">Grupos</Link>
          <Link href="/resultados">Resultados</Link>
        </nav>
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">26</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Porra Mundial 2026</div>
            <h2 className="hero-name">Apuestas de todos</h2>
            <p className="lead">Solo se muestran apuestas confirmadas.</p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="loading-screen"><p className="muted">Cargando…</p></div>
      ) : (
        <div className="bets-grid">
          {allUsers.map((uid) => {
            const bet = betMap[uid];
            const displayName = cap(uid);
            const isMe = currentUser?.toLowerCase() === uid;

            if (!bet || !bet.confirmed) {
              return (
                <div className="bet-card bet-card--pending" key={uid}>
                  <div className="bet-card-header">
                    <span className="bet-card-name">{displayName}{isMe ? " (tú)" : ""}</span>
                    <span className="status-badge status-pending">Sin confirmar</span>
                  </div>
                  <p className="muted" style={{ margin: "12px 0 0" }}>Apuesta no confirmada todavía.</p>
                </div>
              );
            }

            const cost = ticketCost(bet.favorites, bet.antiFavorites);

            return (
              <div className="bet-card" key={uid}>
                <div className="bet-card-header">
                  <span className="bet-card-name">{displayName}{isMe ? " (tú)" : ""}</span>
                  <span className="status-badge status-confirmed">Confirmada · {cost}€</span>
                </div>

                <div className="bet-card-section">
                  <h4 className="bet-card-label">Favoritos ({bet.favorites.length})</h4>
                  <ul className="bet-team-list fav-list">
                    {bet.favorites.map((id) => {
                      const team = TEAMS.find((t) => t.id === id);
                      return (
                        <li key={id}>
                          <span className="bet-team-name">{teamName(id)}</span>
                          <span className="bet-team-group">Gr. {team?.group}</span>
                          <span className="bet-team-price">+{team?.price}€</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="bet-card-section">
                  <h4 className="bet-card-label">Antifavoritos ({bet.antiFavorites.length})</h4>
                  <ul className="bet-team-list anti-list">
                    {bet.antiFavorites.map((id) => {
                      const team = TEAMS.find((t) => t.id === id);
                      return (
                        <li key={id}>
                          <span className="bet-team-name">{teamName(id)}</span>
                          <span className="bet-team-group">Gr. {team?.group}</span>
                          <span className="bet-team-price">−{team?.price}€</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
