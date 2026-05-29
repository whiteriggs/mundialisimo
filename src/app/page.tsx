"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import {
  getUsers,
  hasUserPassword,
  createUserPassword,
  verifyUserPassword,
  storeUser,
  getStoredUser,
} from "@/lib/auth";

type Mode = "idle" | "checking" | "register" | "login";

const ALL_RULES = [
  {
    title: "Cómo funciona",
    items: [
      "Elige entre 9 y 12 favoritos y entre 4 y 6 antifavoritos.",
      "Solo un favorito y un antifavorito por grupo.",
      "Tu puntuación = puntos de favoritos − puntos de antifavoritos.",
      "Apuestas idénticas se desempatan por orden de registro.",
    ],
  },
  {
    title: "Puntuación por partido",
    items: [
      "Grupos y 3er puesto: +1 por gol, +5 por empate, +10 por victoria.",
      "Eliminatorias: +1 por gol, +5 por jugar, +5 por empate, +10 por victoria.",
      "Partidos resueltos en penaltis cuentan como empate.",
      "Los goles en la tanda de penaltis no puntúan.",
    ],
  },
  {
    title: "Desempates",
    items: [
      "Mejor posición media de favoritos en el ranking final (1-48).",
      "Si persiste el empate, decide el superfavorito.",
      "Último criterio: orden de inscripción.",
    ],
  },
];

export default function Home() {
  const router = useRouter();
  const [userList, setUserList] = useState<string[]>([]);
  const [name, setName]         = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode]         = useState<Mode>("idle");
  const [error, setError]       = useState("");
  const [busy, setBusy]         = useState(false);
  const [alreadyIn, setAlreadyIn] = useState<string | null>(null);

  useEffect(() => {
    getUsers().then(setUserList);
    const stored = getStoredUser();
    if (stored) setAlreadyIn(stored);
  }, []);

  useEffect(() => {
    if (!name) { setMode("idle"); return; }
    setMode("checking");
    setError("");
    setPassword("");
    hasUserPassword(name)
      .then((has) => setMode(has ? "login" : "register"))
      .catch(() => setMode("login"));
  }, [name]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "register") {
      if (password.length < 4) { setError("Mínimo 4 caracteres."); return; }
      setBusy(true);
      setError("");
      try {
        await createUserPassword(name, password);
        storeUser(name);
        router.push("/apuesta");
      } catch {
        setError("Error al guardar. Inténtalo de nuevo.");
      } finally {
        setBusy(false);
      }
    } else {
      setBusy(true);
      setError("");
      try {
        const ok = await verifyUserPassword(name, password);
        if (ok) { storeUser(name); router.push("/apuesta"); }
        else setError("Contraseña incorrecta.");
      } catch {
        setError("Error de conexión.");
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialísimo</h1>
          <span className="sub">Porra del Mundial 2026</span>
        </div>
        {alreadyIn && <NavBar user={alreadyIn} />}
      </header>

      <div className="home-layout">
        {/* ── Left: hero + rules ─────────────────────────────── */}
        <div className="home-left">
          <div className="home-hero-text">
            <p className="hero-eyebrow">Mundial 2026 · 48 equipos · 12 grupos</p>
            <h2 className="home-title">La porra más<br />completa del mundial</h2>
            <p className="home-subtitle">
              Elige tus favoritos y antifavoritos. Cada partido cuenta. Gana quien
              mejor lea el torneo, no solo el campeón.
            </p>
          </div>

          <div className="home-rules">
            {ALL_RULES.map((section) => (
              <div key={section.title} className="home-rule-section">
                <h3>{section.title}</h3>
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: login card ──────────────────────────────── */}
        <div className="home-right">
          <div className="home-login-card card">
            {alreadyIn ? (
              <>
                <p className="home-login-eyebrow">Sesión activa</p>
                <h3 className="home-login-title">Hola, {alreadyIn}</h3>
                <p className="muted" style={{ marginBottom: "1.25rem" }}>
                  Tienes una sesión abierta. ¿Volver a tu apuesta?
                </p>
                <button className="btn" style={{ width: "100%" }} onClick={() => router.push("/apuesta")}>
                  Ver mi apuesta
                </button>
                <button
                  className="mini-action"
                  style={{ marginTop: "0.75rem", display: "block", textAlign: "center", width: "100%" }}
                  onClick={() => { setAlreadyIn(null); }}
                >
                  Entrar con otra cuenta
                </button>
              </>
            ) : (
              <>
                <p className="home-login-eyebrow">Accede a la porra</p>
                <h3 className="home-login-title">¿Quién eres?</h3>

                <form onSubmit={handleSubmit} className="home-login-form">
                  <div className="login-field">
                    <label htmlFor="hl-name">Tu nombre</label>
                    <select
                      id="hl-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    >
                      <option value="">— Selecciona —</option>
                      {userList.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>

                  {mode === "checking" && (
                    <p className="login-checking">Comprobando…</p>
                  )}

                  {(mode === "register" || mode === "login") && (
                    <div className="login-field">
                      <label htmlFor="hl-pw">
                        {mode === "register" ? "Crea tu contraseña" : "Contraseña"}
                      </label>
                      <input
                        id="hl-pw"
                        type="password"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(""); }}
                        placeholder="••••••••"
                        required
                        autoComplete={mode === "register" ? "new-password" : "current-password"}
                      />
                    </div>
                  )}

                  {mode === "register" && (
                    <p className="home-login-hint">
                      Primera vez que entras. Crea tu contraseña personal.
                    </p>
                  )}

                  {error && <p className="login-error">{error}</p>}

                  {(mode === "register" || mode === "login") && (
                    <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
                      {busy
                        ? "…"
                        : mode === "register"
                        ? "Crear contraseña y entrar"
                        : "Entrar"}
                    </button>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

