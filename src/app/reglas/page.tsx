"use client";

import { getStoredUser, clearUser } from "@/lib/auth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";

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
    title: "Precio de los equipos",
    items: [
      "Cada equipo tiene un precio según su clasificación FIFA en el grupo (1.º cuesta más, 4.º menos).",
      "La suma del precio de tus favoritos menos el de tus antifavoritos debe estar entre 15 y 22 puntos.",
      "Esto obliga a equilibrar: no puedes coger solo los mejores favoritos sin asumir antifavoritos caros.",
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

export default function ReglasPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

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
          <span className="sub">Reglas</span>
        </div>
        <NavBar user={user} />
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">📋</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Porra del Mundial 2026</div>
            <h2 className="hero-name">Reglas</h2>
            <p className="lead">Cómo funciona la porra, los precios, la puntuación y los desempates.</p>
          </div>
        </div>
      </section>

      <div className="page-content">
        <div className="home-rules" style={{ maxWidth: "640px", margin: "0 auto" }}>
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
    </main>
  );
}
