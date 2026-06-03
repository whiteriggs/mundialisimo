"use client";

import { useEffect, useState } from "react";

const UFWC_BASE = "https://whiteriggs.github.io/UFCC";

export default function UfwcChampion({ compact = false }: { compact?: boolean }) {
  const [name, setName] = useState<string | null>(null);
  const [flag, setFlag] = useState("🏆");

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`${UFWC_BASE}/data-ufwc/stats.json`).then((r) => r.json()),
      fetch(`${UFWC_BASE}/data-ufwc/clubs.json`).then((r) => r.json()),
    ])
      .then(([stats, clubs]) => {
        if (!alive) return;
        const champ: string = stats.current_champion;
        setName(champ);
        setFlag(clubs[champ] || "🏆");
      })
      .catch(() => {
        /* si falla la red, no mostramos nada */
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
