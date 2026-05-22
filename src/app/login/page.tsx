"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { checkLogin, storeUser, USERS } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (checkLogin(name, password)) {
      storeUser(name);
      router.push("/apuesta");
    } else {
      setError("Nombre o contraseña incorrectos.");
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
          <div className="hero-crest placeholder">26</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Acceso a la porra</div>
            <h2 className="hero-name">¿Quién eres?</h2>
            <p className="lead">Selecciona tu nombre y escribe la contraseña para acceder a tu apuesta.</p>
          </div>
        </div>
      </section>

      <div className="login-container">
        <form className="login-form card" onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="name">Tu nombre</label>
            <select
              id="name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              required
            >
              <option value="">— Selecciona —</option>
              {USERS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          <div className="login-field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="••••••••••••"
              required
            />
          </div>

          {error && <p className="login-error">{error}</p>}

          <button className="btn" type="submit">Entrar</button>
        </form>
      </div>
    </main>
  );
}
