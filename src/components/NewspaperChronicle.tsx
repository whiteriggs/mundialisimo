"use client";

import { useEffect, useState, type ReactNode } from "react";
import { parseChronicle } from "@/lib/chronicle";
import { fetchUsersRest } from "@/lib/leaderboard";
import { getGroupId } from "@/lib/group";
import type { LeaderboardRow } from "@/lib/leaderboard";

// Resalta en negrita los nombres de participantes que aparezcan en un texto.
// Hace el match por palabra completa e ignorando mayúsculas/acentos no, pero sí
// respeta límites de palabra para no resaltar trozos dentro de otras palabras.
function highlightNames(text: string, names: string[]): ReactNode {
  if (names.length === 0) return text;
  // Orden por longitud desc para que "JuanRa" gane a "Juan".
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?<![\\p{L}])(${escaped.join("|")})(?![\\p{L}])`, "giu");
  const parts = text.split(re);
  return parts.map((part, i) => {
    const isName = sorted.some((n) => n.toLowerCase() === part.toLowerCase());
    return isName ? <strong key={i} className="np-name">{part}</strong> : part;
  });
}

// Renderiza una crónica de LaIA con estética de diario deportivo. Si el texto no
// trae el formato estructurado (crónicas antiguas), cae a texto plano.
export default function NewspaperChronicle({
  text,
  dateLabel,
  leaderboard,
}: {
  text: string;
  dateLabel: string;
  leaderboard?: LeaderboardRow[];
}) {
  const parsed = parseChronicle(text);
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    fetchUsersRest(getGroupId()).then(setNames).catch(() => setNames([]));
  }, []);

  if (!parsed) {
    return (
      <div className="card" style={{ maxWidth: 720, margin: "0 auto" }}>
        <div className="chronicle-text">
          {text.split("\n").map((line, i) =>
            line.trim() ? <p key={i} style={{ margin: "0.3rem 0" }}>{line}</p> : <br key={i} />
          )}
        </div>
      </div>
    );
  }

  return (
    <article className="newspaper">
      <div className="np-masthead">
        <span className="np-edition">Edición especial</span>
        <h1 className="np-title">El Mundialísimo</h1>
        <span className="np-date">{dateLabel} · Crónica de LaIA</span>
      </div>
      <div className="np-rule" />

      <h2 className="np-headline">{parsed.headline}</h2>
      {parsed.standfirst && <p className="np-standfirst">{parsed.standfirst}</p>}

      {parsed.body.length > 0 && (
        <div className="np-body">
          {parsed.body.map((p, i) => (
            <p key={i} className={i === 0 ? "np-lead-para" : undefined}>{highlightNames(p, names)}</p>
          ))}
        </div>
      )}

      {parsed.ranking.length > 0 && (
        <div className="np-ranking">
          <h3 className="np-section-title">⚖️ El veredicto de la porra</h3>
          <ol className="np-ranking-list">
            {parsed.ranking.map((r) => (
              <li key={r.pos} className="np-ranking-item">
                <span className="np-rank-pos">{r.pos}</span>
                <span className="np-rank-body">
                  <strong className="np-rank-name">{r.name}</strong>
                  <span className="np-rank-comment">{r.comment}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {leaderboard && leaderboard.length > 0 && (
        <div className="np-standings">
          <h3 className="np-section-title">📊 La tabla de la porra</h3>          <table className="np-standings-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Participante</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row, i) => {
                const pos = i + 1;
                const isLeader = i === 0 && row.confirmed;
                const isLast = i === leaderboard.length - 1 && row.confirmed;
                return (
                  <tr
                    key={row.user}
                    className={`${isLeader ? "np-st-leader" : ""} ${isLast ? "np-st-last" : ""}`.trim()}
                  >
                    <td className="np-st-pos">{row.confirmed ? pos : "—"}</td>
                    <td className="np-st-name">
                      {row.user}
                      {isLeader && <span className="np-st-badge">👑 Líder</span>}
                      {isLast && <span className="np-st-badge np-st-badge-red">🥄 Farolillo</span>}
                    </td>
                    <td className="np-st-pts">{row.confirmed ? row.total : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="np-footer">Redacción: LaIA · Corresponsal con mala leche cariñosa</div>
    </article>
  );
}
