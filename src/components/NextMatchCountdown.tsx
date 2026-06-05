"use client";

import { useEffect, useState } from "react";
import Flag from "@/components/Flag";
import { fetchAllMatches, type ApiAllMatch } from "@/lib/football-api";

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

export default function NextMatchCountdown({ compact = false }: { compact?: boolean }) {
  const [match, setMatch] = useState<ApiAllMatch | null>(null);
  const [left, setLeft] = useState<Remaining>(null);

  useEffect(() => {
    let alive = true;
    fetchAllMatches()
      .then((all) => {
        if (!alive) return;
        const now = Date.now();
        const next = all
          .filter((m) => !m.played && new Date(m.utcDate).getTime() > now)
          .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())[0];
        setMatch(next ?? null);
      })
      .catch(() => {
        /* sin datos: no mostramos nada */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!match) return;
    const tick = () => setLeft(remainingTo(match.utcDate));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [match]);

  if (!match || !left) return null;

  const kickoff = new Date(match.utcDate).toLocaleString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (compact) {
    const time =
      left.d > 0
        ? `${left.d}d ${pad(left.h)}:${pad(left.m)}:${pad(left.s)}`
        : `${pad(left.h)}:${pad(left.m)}:${pad(left.s)}`;
    return (
      <div
        className="next-match-pill"
        title={`Próximo partido: ${match.home} vs ${match.away} · ${kickoff}`}
      >
        <span className="next-match-pill-label">Próximo</span>
        <Flag name={match.home} />
        <span className="next-match-pill-vs">vs</span>
        <Flag name={match.away} />
        <span className="next-match-pill-time">{time}</span>
      </div>
    );
  }

  return (
    <div className="next-match card">
      <span className="next-match-eyebrow">Próximo partido</span>
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
    </div>
  );
}
