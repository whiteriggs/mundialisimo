"use client";

import { useEffect, useState } from "react";

const UFWC_BASE = "https://whiteriggs.github.io/UFCC";
const CACHE_KEY = "ufwc.champion";

type Cached = { name: string; flag: string };

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

export default function UfwcChampion({ compact = false }: { compact?: boolean }) {
  const [name, setName] = useState<string | null>(null);
  const [flag, setFlag] = useState("🏆");

  // Render the last known champion immediately so the pill never blanks out
  // across navigations if a single cross-origin fetch fails on mobile.
  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setName(cached.name);
      setFlag(cached.flag);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`${UFWC_BASE}/data-ufwc/stats.json`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`${UFWC_BASE}/data-ufwc/clubs.json`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([stats, clubs]) => {
        if (!alive) return;
        const champ: string = stats.current_champion;
        const champFlag: string = clubs[champ] || "🏆";
        setName(champ);
        setFlag(champFlag);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ name: champ, flag: champFlag }));
        } catch {
          /* almacenamiento no disponible — ignoramos */
        }
      })
      .catch(() => {
        /* si falla la red, mantenemos el valor cacheado (si lo hay) */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!name) return null;

  return (
    <a
      href={`${UFWC_BASE}/?mode=nations`}
      target="_blank"
      rel="noopener noreferrer"
      title="Campeón actual del Unofficial Football World Championship — abre la web"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? "0.4rem" : "0.6rem",
        padding: compact ? "0.3rem 0.6rem" : "0.5rem 0.9rem",
        borderRadius: 999,
        border: "1px solid var(--line)",
        background: "var(--bg-2)",
        color: "var(--text)",
        textDecoration: "none",
        fontSize: compact ? "0.78rem" : "0.9rem",
        lineHeight: 1,
        width: "fit-content",
        whiteSpace: "nowrap",
        transition: "border-color 0.15s ease",
      }}
    >
      <span style={{ color: "var(--text-dim)", fontSize: compact ? "0.72rem" : "0.8rem" }}>
        {compact ? "UFWC" : "Campeón UFWC"}
      </span>
      <span style={{ fontSize: compact ? "1.05rem" : "1.25rem" }}>{flag}</span>
      <span style={{ fontWeight: 600 }}>{name}</span>
      <span style={{ color: "var(--accent)", fontSize: compact ? "0.72rem" : "0.8rem" }}>↗</span>
    </a>
  );
}
