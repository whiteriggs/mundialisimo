"use client";

import { useState } from "react";

export interface ChartSeries {
  uid: string;
  name: string;
  points: number[]; // longitud = labels.length + 1 (incluye el 0 inicial)
}

// Paleta tipo Grafana (colores vivos y distinguibles sobre fondo oscuro).
const PALETTE = [
  "#7EB26D", "#EAB839", "#6ED0E0", "#EF843C", "#E24D42", "#1F78C1",
  "#BA43A9", "#705DA0", "#508642", "#CCA300", "#447EBC", "#C15C17",
  "#890F02", "#0A437C", "#6D1F62", "#584477",
];

function colorFor(i: number) {
  return PALETTE[i % PALETTE.length];
}

// Path con segmentos rectos entre puntos. Usamos líneas rectas (no curvas) porque
// los valores son puntos ACUMULADOS reales: una curva suave haría "overshoot" y
// dibujaría jorobas por encima de valores que nunca se alcanzaron.
function linePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

export default function PointsHistoryChart({
  labels,
  series,
  currentUid,
}: {
  labels: string[];
  series: ChartSeries[];
  currentUid?: string;
}) {
  const [highlight, setHighlight] = useState<string | null>(null);

  if (series.length === 0 || labels.length === 0) {
    return <p className="muted">El histórico aparecerá cuando se jueguen partidos y haya apuestas confirmadas.</p>;
  }

  // Dimensiones del lienzo (viewBox). Se escala al ancho del contenedor.
  const W = 820;
  const H = 380;
  const padL = 38;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const nCols = labels.length; // nº de partidos; eje X va de 0..nCols
  const allVals = series.flatMap((s) => s.points);
  const rawMax = Math.max(1, ...allVals);
  const rawMin = Math.min(0, ...allVals);
  // Redondear el dominio a múltiplos "bonitos".
  const step = niceStep((rawMax - rawMin) / 5);
  const yMax = Math.ceil(rawMax / step) * step;
  const yMin = Math.floor(rawMin / step) * step;

  const x = (i: number) => padL + (nCols === 0 ? 0 : (i / nCols) * plotW);
  const y = (v: number) => padT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax + 0.001; v += step) yTicks.push(Math.round(v));

  // Etiquetas X: como puede haber muchos partidos, mostramos como mucho ~8.
  const maxXLabels = 8;
  const xStep = Math.max(1, Math.ceil(nCols / maxXLabels));

  return (
    <div className="ph-wrap">
      <div className="ph-chart">
        <svg viewBox={`0 0 ${W} ${H}`} className="ph-svg" role="img" aria-label="Evolución de puntos">
          <defs>
            <filter id="ph-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid horizontal + etiquetas Y */}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} className={v === 0 ? "ph-grid ph-grid-zero" : "ph-grid"} />
              <text x={padL - 6} y={y(v) + 3} className="ph-axis-label" textAnchor="end">{v}</text>
            </g>
          ))}

          {/* Etiquetas X */}
          {labels.map((lab, i) =>
            i % xStep === 0 || i === labels.length - 1 ? (
              <text key={i} x={x(i + 1)} y={H - 8} className="ph-axis-label" textAnchor="middle">{lab}</text>
            ) : null
          )}

          {/* Líneas */}
          {series.map((s, idx) => {
            const pts = s.points.map((v, i) => ({ x: x(i), y: y(v) }));
            const dimmed = highlight !== null && highlight !== s.uid;
            const isMe = s.uid === currentUid;
            const isHi = highlight === s.uid;
            const c = colorFor(idx);
            return (
              <g key={s.uid} opacity={dimmed ? 0.15 : 1} style={{ transition: "opacity 150ms" }}>
                <path
                  d={linePath(pts)}
                  fill="none"
                  stroke={c}
                  strokeWidth={isHi ? 3.4 : isMe ? 2.8 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter={isHi || isMe ? "url(#ph-glow)" : undefined}
                />
                {/* punto final */}
                <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={isHi || isMe ? 4 : 3} fill={c} />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Leyenda */}
      <div className="ph-legend">
        {series.map((s, idx) => {
          const last = s.points[s.points.length - 1];
          return (
            <button
              key={s.uid}
              className={`ph-legend-item${highlight === s.uid ? " ph-legend-on" : ""}${s.uid === currentUid ? " ph-legend-me" : ""}`}
              onMouseEnter={() => setHighlight(s.uid)}
              onMouseLeave={() => setHighlight(null)}
              onClick={() => setHighlight((h) => (h === s.uid ? null : s.uid))}
            >
              <span className="ph-legend-dot" style={{ background: colorFor(idx) }} />
              <span className="ph-legend-name">{s.name}</span>
              <span className="ph-legend-pts">{last}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return Math.max(1, mult * pow);
}
