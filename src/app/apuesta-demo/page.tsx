"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Team = {
  id: string;
  name: string;
  group: string;
  price: number;
};

const groupPool: Record<string, string[]> = {
  A: ["USA", "Mexico", "Costa Rica", "Ghana"],
  B: ["Brazil", "Serbia", "Japan", "Canada"],
  C: ["Argentina", "Poland", "Egypt", "Australia"],
  D: ["Spain", "Uruguay", "Korea", "Tunisia"],
  E: ["France", "Denmark", "Nigeria", "Peru"],
  F: ["England", "Switzerland", "Iran", "Ecuador"],
  G: ["Portugal", "Croatia", "Morocco", "Iraq"],
  H: ["Germany", "Colombia", "Cameroon", "Saudi Arabia"],
  I: ["Italy", "Senegal", "Chile", "Qatar"],
  J: ["Netherlands", "Turkey", "Paraguay", "New Zealand"],
  K: ["Belgium", "Sweden", "Algeria", "Honduras"],
  L: ["Japan B", "Romania", "Panama", "South Africa"]
};

const teams: Team[] = Object.entries(groupPool).flatMap(([group, names], groupIndex) =>
  names.map((name, teamIndex) => ({
    id: `${group}-${teamIndex + 1}`,
    name,
    group,
    price: 1 + ((groupIndex + teamIndex) % 5)
  }))
);

const favoriteBounds = { min: 9, max: 12 };
const antiBounds = { min: 4, max: 6 };
const ticketBounds = { min: 10, max: 15 };

function hasDuplicateGroup(ids: string[]) {
  const groups = ids
    .map((id) => teams.find((team) => team.id === id)?.group)
    .filter(Boolean) as string[];
  return new Set(groups).size !== groups.length;
}

export default function ApuestaDemoPage() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [antiFavorites, setAntiFavorites] = useState<string[]>([]);

  const favoritesCost = useMemo(
    () => favorites.reduce((sum, id) => sum + (teams.find((team) => team.id === id)?.price ?? 0), 0),
    [favorites]
  );

  const antiDiscount = useMemo(
    () => antiFavorites.reduce((sum, id) => sum + (teams.find((team) => team.id === id)?.price ?? 0), 0),
    [antiFavorites]
  );

  const ticketCost = favoritesCost - antiDiscount;
  const overlap = favorites.some((id) => antiFavorites.includes(id));

  const validations = [
    {
      ok: favorites.length >= favoriteBounds.min && favorites.length <= favoriteBounds.max,
      text: `Favoritos: ${favoriteBounds.min}-${favoriteBounds.max} (actual ${favorites.length})`
    },
    {
      ok: antiFavorites.length >= antiBounds.min && antiFavorites.length <= antiBounds.max,
      text: `Antifavoritos: ${antiBounds.min}-${antiBounds.max} (actual ${antiFavorites.length})`
    },
    {
      ok: !hasDuplicateGroup(favorites),
      text: "No repetir grupo en favoritos"
    },
    {
      ok: !hasDuplicateGroup(antiFavorites),
      text: "No repetir grupo en antifavoritos"
    },
    {
      ok: !overlap,
      text: "Un equipo no puede estar en ambos bloques"
    },
    {
      ok: ticketCost >= ticketBounds.min && ticketCost <= ticketBounds.max,
      text: `Coste total entre ${ticketBounds.min} y ${ticketBounds.max} euros (actual ${ticketCost} euros)`
    }
  ];

  const allValid = validations.every((rule) => rule.ok);

  return (
    <main className="page shell">
      <section className="card hero glow-panel">
        <div className="hero-top">
          <p className="eyebrow">Demo sin login</p>
          <span className="soft-pill">Validacion en tiempo real</span>
        </div>
        <h1>Creador de apuesta 2026</h1>
        <p className="lead">
          Selecciona equipos y revisa restricciones al instante. Esta version es una
          maqueta funcional de la experiencia que usaran los participantes.
        </p>
        <div className="hero-actions">
          <Link className="btn btn-secondary" href="/">
            Volver al inicio
          </Link>
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Seleccion de favoritos</h2>
          <p className="muted">Marca entre 9 y 12 equipos, maximo 1 por grupo.</p>
          <div className="team-list">
            {teams.map((team) => (
              <label className="team-item" key={`fav-${team.id}`}>
                <input
                  checked={favorites.includes(team.id)}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setFavorites((current) => [...current, team.id]);
                    } else {
                      setFavorites((current) => current.filter((id) => id !== team.id));
                    }
                  }}
                  type="checkbox"
                />
                <span>
                  {team.name} (Grupo {team.group}) - {team.price} euros
                </span>
              </label>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>Seleccion de antifavoritos</h2>
          <p className="muted">Marca entre 4 y 6 equipos, maximo 1 por grupo.</p>
          <div className="team-list">
            {teams.map((team) => (
              <label className="team-item" key={`anti-${team.id}`}>
                <input
                  checked={antiFavorites.includes(team.id)}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setAntiFavorites((current) => [...current, team.id]);
                    } else {
                      setAntiFavorites((current) => current.filter((id) => id !== team.id));
                    }
                  }}
                  type="checkbox"
                />
                <span>
                  {team.name} (Grupo {team.group}) - {team.price} euros
                </span>
              </label>
            ))}
          </div>
        </article>

        <article className="card highlight">
          <h2>Resumen</h2>
          <p>Coste favoritos: {favoritesCost} euros</p>
          <p>Abono antifavoritos: {antiDiscount} euros</p>
          <p>
            <strong>Coste final: {ticketCost} euros</strong>
          </p>
          <h3>Validaciones</h3>
          <ul className="checks">
            {validations.map((rule) => (
              <li className={rule.ok ? "ok" : "ko"} key={rule.text}>
                {rule.ok ? "OK" : "REV"} - {rule.text}
              </li>
            ))}
          </ul>
          <p className={allValid ? "ok" : "ko"}>
            {allValid
              ? "Apuesta valida para registrar en la siguiente fase con usuarios."
              : "La apuesta aun no cumple todas las reglas."}
          </p>
        </article>
      </section>
    </main>
  );
}
