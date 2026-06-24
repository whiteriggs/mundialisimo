"use client";

import { useCallback, useEffect, useState } from "react";
import Flag from "@/components/Flag";
import { fetchAllMatches, type ApiAllMatch } from "@/lib/football-api";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
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
  // Puede haber más de un partido en directo a la vez (jornadas con horarios
  // solapados). `liveMatches` los recoge todos; `match` es el próximo a jugarse
  // cuando no hay ninguno en directo.
  const [liveMatches, setLiveMatches] = useState<ApiAllMatch[]>([]);
  const [match, setMatch] = useState<ApiAllMatch | null>(null);
  const [left, setLeft] = useState<Remaining>(null);
  const live = liveMatches.length > 0;

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

  // Refresca periódicamente para que el marcador en directo se actualice.
  const refresh = useCallback(() => {
    fetchAllMatches()
      .then((all) => {
        const future = all
          .filter((m) => !m.played)
          .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
        setUpcoming(future);
      })
      .catch(() => {});
  }, []);
  useLiveRefresh(refresh, live ? 12_000 : 30_000);

  useEffect(() => {
    if (upcoming.length === 0) {
      setMatch(null);
      setLiveMatches([]);
      return;
    }
    const tick = () => {
      const now = Date.now();
      // Partidos en directo = los que ya han empezado y cuyo final estimado
      // (inicio + duración) aún no ha pasado. Puede haber varios a la vez.
      const liveNow = upcoming.filter((m) => {
        const start = new Date(m.utcDate).getTime();
        return start <= now && start + MATCH_DURATION_MS > now;
      });
      setLiveMatches(liveNow);
      if (liveNow.length > 0) {
        // Hay partidos en juego: no mostramos cuenta atrás.
        setMatch(null);
        setLeft(null);
        return;
      }
      // Nada en directo: el próximo que aún no ha empezado.
      const next = upcoming.find((m) => new Date(m.utcDate).getTime() > now) ?? null;
      setMatch(next);
      setLeft(next ? remainingTo(next.utcDate) : null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [upcoming]);

  if (!match && !live) return null;

  const kickoffOf = (m: ApiAllMatch) =>
    new Date(m.utcDate).toLocaleString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (compact) {
    // En directo: una pill por cada partido en juego (pueden ser varios a la vez).
    if (live) {
      return (
        <div className="next-match-pills">
          {liveMatches.map((m) => {
            const hasScore = m.homeGoals !== null && m.awayGoals !== null;
            return (
              <div
                key={m.id}
                className="next-match-pill is-live"
                title={`En directo: ${m.home} vs ${m.away} · ${kickoffOf(m)}`}
              >
                <span className="next-match-pill-label">En directo</span>
                <Flag name={m.home} />
                {hasScore ? (
                  <span className="next-match-pill-score">{m.homeGoals}-{m.awayGoals}</span>
                ) : (
                  <span className="next-match-pill-vs">vs</span>
                )}
                <Flag name={m.away} />
                <span className="next-match-pill-time next-match-pill-live">●</span>
              </div>
            );
          })}
        </div>
      );
    }
    // Próximo partido: cuenta atrás.
    if (!match) return null;
    const time = left
      ? left.d > 0
        ? `${left.d}d ${pad(left.h)}:${pad(left.m)}:${pad(left.s)}`
        : `${pad(left.h)}:${pad(left.m)}:${pad(left.s)}`
      : null;
    return (
      <div
        className="next-match-pill"
        title={`Próximo partido: ${match.home} vs ${match.away} · ${kickoffOf(match)}`}
      >
        <span className="next-match-pill-label">Próximo</span>
        <Flag name={match.home} />
        <span className="next-match-pill-vs">vs</span>
        <Flag name={match.away} />
        <span className="next-match-pill-time">{time}</span>
      </div>
    );
  }

  // Versión grande (tarjeta): el primer partido en directo o el próximo.
  const main = live ? liveMatches[0] : match;
  if (!main) return null;
  const kickoff = kickoffOf(main);

  return (
    <div className="next-match card">
      <span className="next-match-eyebrow">{live ? "En directo" : "Próximo partido"}</span>
      <div className="next-match-teams">
        <span className="next-match-team">
          <Flag name={main.home} />
          {main.home}
        </span>
        {live && main.homeGoals !== null && main.awayGoals !== null ? (
          <span className="next-match-score">{main.homeGoals}-{main.awayGoals}</span>
        ) : (
          <span className="next-match-vs">vs</span>
        )}
        <span className="next-match-team">
          <Flag name={main.away} />
          {main.away}
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
        {tvChannelsFor(main).map((ch) => (
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
