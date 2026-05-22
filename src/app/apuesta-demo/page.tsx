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
  A: ["México", "Sudáfrica", "Rep. Corea", "Rep. Checa"],
  B: ["Canadá", "Bosnia y Herz.", "Catar", "Suiza"],
  C: ["Brasil", "Marruecos", "Haití", "Escocia"],
  D: ["EE.UU.", "Paraguay", "Australia", "Turquía"],
  E: ["Alemania", "Costa Marfil", "Ecuador", "Curazao"],
  F: ["Países Bajos", "Japón", "Suecia", "Túnez"],
  G: ["Bélgica", "Egipto", "Irán", "Nueva Zelanda"],
  H: ["España", "Uruguay", "Arabia Saudí", "Cabo Verde"],
  I: ["Francia", "Noruega", "Senegal", "Irak"],
  J: ["Argentina", "Austria", "Argelia", "Jordania"],
  K: ["Portugal", "Colombia", "RD Congo", "Uzbekistán"],
  L: ["Inglaterra", "Croacia", "Ghana", "Panamá"]
};

const teams: Team[] = Object.entries(groupPool).flatMap(([group, names]) =>
  names.map((name, teamIndex) => ({
    id: `${group}-${teamIndex + 1}`,
    name,
    group,
    price: 4 - teamIndex
  }))
);

const favoriteBounds = { min: 9, max: 12 };
const antiBounds = { min: 4, max: 6 };
const ticketBounds = { min: 15, max: 22 };
const DEADLINE = new Date("2026-06-11T00:00:00");

function hasDuplicateGroup(ids: string[]) {
  const groups = ids
    .map((id) => teams.find((team) => team.id === id)?.group)
    .filter(Boolean) as string[];
  return new Set(groups).size !== groups.length;
}

export default function ApuestaDemoPage() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [antiFavorites, setAntiFavorites] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const isClosed = new Date() >= DEADLINE;

  const groupLabels = Object.keys(groupPool);

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

  function toggleTeam(teamId: string, isFavorite: boolean) {
    if (isFavorite) {
      setFavorites((current) =>
        current.includes(teamId) ? current.filter((id) => id !== teamId) : [...current, teamId]
      );
    } else {
      setAntiFavorites((current) =>
        current.includes(teamId) ? current.filter((id) => id !== teamId) : [...current, teamId]
      );
    }
  }

  function getGroupTeams(group: string) {
    return groupPool[group as keyof typeof groupPool] || [];
  }

  function hasGroupInFavorites(group: string): boolean {
    return favorites.some((id) => {
      const team = teams.find((t) => t.id === id);
      return team?.group === group;
    });
  }

  function hasGroupInAntifavorites(group: string): boolean {
    return antiFavorites.some((id) => {
      const team = teams.find((t) => t.id === id);
      return team?.group === group;
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialisimo</h1>
          <span className="sub">Simulador de apuesta sin login</span>
        </div>
        <Link className="mini-action" href="/">
          Volver al inicio
        </Link>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">26</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Demo interactiva</div>
            <h2 className="hero-name">Creador de apuesta 2026</h2>
            <p className="lead">
              Elige selecciones y valida las reglas en tiempo real antes de pasar
              al registro con usuarios.
            </p>
          </div>
        </div>
      </section>

      <div className={`price-bar ${confirmed ? "price-confirmed" : ticketCost > ticketBounds.max ? "price-over" : ticketCost < ticketBounds.min && (favorites.length > 0 || antiFavorites.length > 0) ? "price-under" : ticketCost >= ticketBounds.min && ticketCost <= ticketBounds.max ? "price-ok" : ""}`}>
        <div className="price-bar-inner">
          <span className="price-bar-total">
            <span className="price-bar-label">{confirmed ? "Apuesta confirmada" : "Apuesta"}</span>
            <span className="price-bar-amount">{ticketCost}€</span>
          </span>
          {!confirmed && <span className="price-bar-range">rango válido: {ticketBounds.min}-{ticketBounds.max}€</span>}
          {confirmed && !isClosed && (
            <button className="btn edit-btn" onClick={() => setConfirmed(false)}>Editar apuesta</button>
          )}
          {isClosed && confirmed && (
            <span className="price-bar-range closed-label">Apuestas cerradas · Mundial en marcha</span>
          )}
        </div>
      </div>

      <div className="bet-builder">
        <section className="bet-section">
          <div className="section-header">
            <h2>Selecciona tus equipos</h2>
            <div className="counters">
              <span className="counter fav-counter">
                <span className="dot-fav" /> Favoritos {favorites.length}/9-12
              </span>
              <span className="counter anti-counter">
                <span className="dot-anti" /> Antifavoritos {antiFavorites.length}/4-6
              </span>
            </div>
          </div>
          {!confirmed && <p className="muted">Usa los botones verdes para favoritos y rojos para antifavoritos. Máximo 1 equipo por grupo en cada bloque.</p>}
          <div className="groups-grid">
            {groupLabels.map((group) => (
              <div className="group-card" key={`group-${group}`}>
                <h3 className="group-label">Grupo {group}</h3>
                <div className="group-teams">
                  {getGroupTeams(group).map((name, idx) => {
                    const teamId = `${group}-${idx + 1}`;
                    const isFav = favorites.includes(teamId);
                    const isAnti = antiFavorites.includes(teamId);
                    const team = teams.find((t) => t.id === teamId);

                    if (confirmed) {
                      return (
                        <div className={`team-result ${isFav ? "team-result-fav" : isAnti ? "team-result-anti" : "team-result-neutral"}`} key={teamId}>
                          <span className="team-name">{name}</span>
                          <span className="team-result-badge">{isFav ? `+${team?.price}€` : isAnti ? `-${team?.price}€` : `${team?.price}€`}</span>
                        </div>
                      );
                    }

                    return (
                      <div className="team-dual" key={teamId}>
                        <div className="team-info">
                          <span className="team-name">{name}</span>
                          <span className="team-price">{team?.price || 0}€</span>
                        </div>
                        <div className="team-controls">
                          <button
                            className={`team-btn fav-btn ${isFav ? "active" : ""} ${(!isFav && (favorites.length >= 12 || hasGroupInFavorites(group) || isAnti)) ? "disabled" : ""}`}
                            onClick={() => toggleTeam(teamId, true)}
                            disabled={!isFav && (favorites.length >= 12 || hasGroupInFavorites(group) || isAnti)}
                            title={isFav ? "Remover de favoritos" : isAnti ? "Ya es antifavorito" : hasGroupInFavorites(group) ? "Ya hay un equipo de este grupo" : "Marcar como favorito"}
                            aria-label={`${name} como favorito`}
                          />
                          <button
                            className={`team-btn anti-btn ${isAnti ? "active" : ""} ${(!isAnti && (antiFavorites.length >= 6 || hasGroupInAntifavorites(group) || isFav)) ? "disabled" : ""}`}
                            onClick={() => toggleTeam(teamId, false)}
                            disabled={!isAnti && (antiFavorites.length >= 6 || hasGroupInAntifavorites(group) || isFav)}
                            title={isAnti ? "Remover de antifavoritos" : isFav ? "Ya es favorito" : hasGroupInAntifavorites(group) ? "Ya hay un equipo de este grupo" : "Marcar como antifavorito"}
                            aria-label={`${name} como antifavorito`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {!confirmed && !isClosed && (
            <div className="bet-actions">
              <button
                className={`btn confirm-btn ${allValid ? "" : "confirm-btn-disabled"}`}
                disabled={!allValid}
                onClick={() => setConfirmed(true)}
              >
                {allValid ? "Confirmar apuesta" : "Completa la apuesta para confirmar"}
              </button>
            </div>
          )}
          {isClosed && !confirmed && (
            <p className="deadline-notice ko">Las apuestas están cerradas desde el inicio del Mundial (11 jun 2026).</p>
          )}
        </section>
      </div>

      <div className="grid">
        <article className="card highlight summary-card">
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
      </div>
    </main>
  );
}
