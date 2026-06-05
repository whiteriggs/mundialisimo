"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getUsers,
  hasUserPassword,
  createUserPassword,
  verifyUserPassword,
  storeUser,
} from "@/lib/auth";
import { GROUPS, getGroupId, setGroupId } from "@/lib/group";

type Mode = "idle" | "checking" | "register" | "login";

export default function LoginPage() {
  const router = useRouter();
  const [group, setGroup]       = useState<string>(getGroupId());
  const [name, setName]       = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode]         = useState<Mode>("idle");
  const [error, setError]       = useState("");
  const [busy, setBusy]         = useState(false);
  const [userList, setUserList]  = useState<string[]>([]);

  useEffect(() => {
    getUsers().then(setUserList);
  }, [group]);

  function handleGroupChange(id: string) {
    setGroupId(id);
    setGroup(id);
    setName("");
    setPassword("");
    setError("");
    setMode("idle");
  }

  // When the user picks a name, check Firestore for existing password
  useEffect(() => {
    if (!name) { setMode("idle"); return; }
    setMode("checking");
    setError("");
    setPassword("");
    hasUserPassword(name)
      .then((has) => setMode(has ? "login" : "register"))
      .catch(() => setMode("login"));
  }, [name]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
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
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const ok = await verifyUserPassword(name, password);
      if (ok) {
        storeUser(name);
        router.push("/apuesta");
      } else {
        setError("Contraseña incorrecta.");
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialisimo</h1>
          <span className="sub">Porra Mundial 2026</span>
        </div>
        <Link className="mini-action" href="/">Inicio</Link>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">⚽</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Acceso a la porra</div>
            <h2 className="hero-name">¿Quién eres?</h2>
            <p className="lead">
              {mode === "register"
                ? "Primera vez que entras. Crea tu contraseña personal."
                : "Selecciona tu nombre para acceder a tu apuesta."}
            </p>
          </div>
        </div>
      </section>

      <div className="login-container">
        <form
          className="login-form card"
          onSubmit={mode === "register" ? handleRegister : handleLogin}
        >
          {/* Group selector */}
          <div className="login-field">
            <label htmlFor="group">Grupo</label>
            <select
              id="group"
              value={group}
              onChange={(e) => handleGroupChange(e.target.value)}
            >
              {Object.entries(GROUPS).map(([id, cfg]) => (
                <option key={id} value={id}>{cfg.label}</option>
              ))}
            </select>
          </div>

          {/* Name selector */}
          <div className="login-field">
            <label htmlFor="name">Tu nombre</label>
            <select
              id="name"
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

          {/* Checking spinner */}
          {mode === "checking" && (
            <p className="login-checking">Comprobando…</p>
          )}

          {/* Password field (both modes) */}
          {(mode === "register" || mode === "login") && (
            <div className="login-field">
              <label htmlFor="password">
                {mode === "register" ? "Crea tu contraseña" : "Contraseña"}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="••••••••"
                required
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
            </div>
          )}

          {error && <p className="login-error">{error}</p>}

          {mode === "register" && (
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Crear contraseña"}
            </button>
          )}

          {mode === "login" && (
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Entrando…" : "Entrar"}
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
