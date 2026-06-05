"use client";

import { useEffect, useState } from "react";
import Flag from "@/components/Flag";
import { fetchAllMatches, type ApiAllMatch } from "@/lib/football-api";
import { tvChannelsFor } from "@/lib/tv-channels";

type Remaining = { d: number; h: number; m: number; s: number } | null;

function remainingTo(iso: string): Remaining {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return null;
  const s = Math.floor(diff / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

// Duración estimada de un partido (90' + descanso + añadido + posible prórroga
// holgada). Mientras no pase este margen desde el inicio lo tratamos como
// "en directo" y no saltamos todavía al siguiente.
const MATCH_DURATION_MS = 2.5 * 60 * 60 * 1000;

export default function NextMatchCountdown({ compact = false }: { compact?: boolean }) {
  const [upcoming, setUpcoming] = useState<ApiAllMatch[]>([]);
  const [match, setMatch] = useState<ApiAllMatch | null>(null);
  const [left, setLeft] = useState<Remaining>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchAllMatches()
      .then((all) => {
        if (!alive) return;
        const future = all
          .filter((m) => !m.played)
          .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
        setUpcoming(future);
      })
      .catch(() => {
        /* sin datos: no mostramos nada */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (upcoming.length === 0) {
      setMatch(null);
      return;
    }
    const tick = () => {
      const now = Date.now();
      // Partido activo = el primero cuyo final estimado (inicio + duración) aún
      // no ha pasado. Así seguimos mostrándolo "en directo" mientras se juega y
      // solo saltamos al siguiente cuando este termina. Todo en memoria, sin
      // recargar ni volver a llamar a la API.
      const current =
        upcoming.find(
          (m) => new Date(m.utcDate).getTime() + MATCH_DURATION_MS > now,
        ) ?? null;
      setMatch(current);
      if (!current) {
        setLeft(null);
        setLive(false);
        return;
      }
      const remaining = remainingTo(current.utcDate);
      setLeft(remaining);
      setLive(remaining === null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [upcoming]);

  if (!match) return null;

  const kickoff = new Date(match.utcDate).toLocaleString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (compact) {
    const time = left
      ? left.d > 0
        ? `${left.d}d ${pad(left.h)}:${pad(left.m)}:${pad(left.s)}`
        : `${pad(left.h)}:${pad(left.m)}:${pad(left.s)}`
      : null;
    return (
      <div
        className={`next-match-pill${live ? " is-live" : ""}`}
        title={
          live
            ? `En directo: ${match.home} vs ${match.away} · ${kickoff}`
            : `Próximo partido: ${match.home} vs ${match.away} · ${kickoff}`
        }
      >
        <span className="next-match-pill-label">{live ? "En directo" : "Próximo"}</span>
        <Flag name={match.home} />
        <span className="next-match-pill-vs">vs</span>
        <Flag name={match.away} />
        {live ? (
          <span className="next-match-pill-time next-match-pill-live">●</span>
        ) : (
          <span className="next-match-pill-time">{time}</span>
        )}
      </div>
    );
  }

  return (
    <div className="next-match card">
      <span className="next-match-eyebrow">{live ? "En directo" : "Próximo partido"}</span>
      <div className="next-match-teams">
        <span className="next-match-team">
          <Flag name={match.home} />
          {match.home}
        </span>
        <span className="next-match-vs">vs</span>
        <span className="next-match-team">
          <Flag name={match.away} />
          {match.away}
        </span>
      </div>
      <div className="next-match-kickoff">{kickoff}</div>
      {live ? (
        <div className="next-match-clock next-match-live-row">
          <span className="next-match-live-dot">●</span>
          <span className="next-match-live-text">En juego</span>
        </div>
      ) : (
        left && (
          <div className="next-match-clock">
            {left.d > 0 && (
              <span className="next-match-unit">
                <b>{left.d}</b>
                <small>días</small>
              </span>
            )}
            <span className="next-match-unit">
              <b>{pad(left.h)}</b>
              <small>h</small>
            </span>
            <span className="next-match-unit">
              <b>{pad(left.m)}</b>
              <small>min</small>
            </span>
            <span className="next-match-unit">
              <b>{pad(left.s)}</b>
              <small>seg</small>
            </span>
          </div>
        )
      )}
      <div className="next-match-tv">
        <span className="next-match-tv-label">Dónde verlo</span>
        {tvChannelsFor(match).map((ch) => (
          <a
            key={ch.name}
            className={`tv-chip tv-${ch.kind}`}
            href={ch.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${ch.name} · ${ch.kind === "gratis" ? "Gratis" : "De pago"}`}
          >
            {ch.name}
          </a>
        ))}
      </div>
    </div>
  );
}
