"use client";

import { parseChronicle } from "@/lib/chronicle";

// Renderiza una crónica de LaIA con estética de diario deportivo. Si el texto no
// trae el formato estructurado (crónicas antiguas), cae a texto plano.
export default function NewspaperChronicle({ text, dateLabel }: { text: string; dateLabel: string }) {
  const parsed = parseChronicle(text);

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
            <p key={i} className={i === 0 ? "np-lead-para" : undefined}>{p}</p>
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

      <div className="np-footer">Redacción: LaIA · Corresponsal con mala leche cariñosa</div>
    </article>
  );
}
