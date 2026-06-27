import { buildGroupStandings } from "./standings";
import { TEAM_NAMES } from "./teams";
import type { Match } from "./scoring";

// ─────────────────────────────────────────────────────────────────────────────
// Modelo de fuerza de selecciones (híbrido) para el simulador de probabilidades.
//
//   fuerza efectiva = base (ranking FIFA aproximado, estilo Elo)
//                     + ajuste por forma (resultados ya jugados en el torneo)
//
// Los valores base son ESTIMACIONES basadas en el ranking mundial aproximado a
// 2026; solo importa su valor RELATIVO (la diferencia entre dos equipos decide
// la probabilidad de cada resultado). El ajuste por forma hace que el modelo se
// afine con lo que va pasando: un equipo que golea sube, uno que encaja baja.
// ─────────────────────────────────────────────────────────────────────────────

// Base Elo aproximada por selección (mismas etiquetas que GROUP_POOL).
export const BASE_ELO: Record<string, number> = {
  // A
  "México": 1690, "Sudáfrica": 1500, "Rep. Corea": 1640, "Rep. Checa": 1620,
  // B
  "Canadá": 1640, "Bosnia y Herz.": 1560, "Catar": 1560, "Suiza": 1770,
  // C
  "Brasil": 2030, "Marruecos": 1850, "Haití": 1380, "Escocia": 1650,
  // D
  "EE.UU.": 1700, "Paraguay": 1640, "Australia": 1650, "Turquía": 1770,
  // E
  "Alemania": 1910, "Curazao": 1410, "Costa Marfil": 1690, "Ecuador": 1730,
  // F
  "Países Bajos": 1930, "Japón": 1790, "Suecia": 1700, "Túnez": 1620,
  // G
  "Bélgica": 1910, "Egipto": 1660, "Irán": 1720, "Nueva Zelanda": 1480,
  // H
  "España": 2050, "Cabo Verde": 1450, "Arabia Saudí": 1560, "Uruguay": 1890,
  // I
  "Francia": 2040, "Senegal": 1830, "Irak": 1540, "Noruega": 1790,
  // J
  "Argentina": 2110, "Argelia": 1720, "Austria": 1740, "Jordania": 1500,
  // K
  "Portugal": 1990, "RD Congo": 1660, "Uzbekistán": 1580, "Colombia": 1870,
  // L
  "Inglaterra": 1990, "Croacia": 1830, "Ghana": 1640, "Panamá": 1540,
};

const DEFAULT_ELO = 1600;
const clamp = (x: number, min: number, max: number) => (x < min ? min : x > max ? max : x);

/**
 * Fuerza efectiva de cada equipo a partir de los partidos de grupo YA jugados.
 * Se calcula UNA vez con los resultados reales (no dentro de cada simulación),
 * para que la fuerza sea estable durante todo el Monte Carlo.
 *
 * Ajuste por forma (acotado a ±200 Elo): premia diferencia de goles y victorias.
 */
export function effectiveRatings(playedGroupMatches: Match[]): Record<string, number> {
  const eff: Record<string, number> = {};
  for (const name of TEAM_NAMES) eff[name] = BASE_ELO[name] ?? DEFAULT_ELO;

  const standings = buildGroupStandings(playedGroupMatches);
  for (const group of Object.values(standings)) {
    for (const s of group) {
      if (s.played === 0) continue;
      // gd pesa ~22 Elo/gol; los puntos por encima de "media de empate" (~1.2/partido)
      // suman ~18 Elo. Acotado para que un buen arranque no dispare la fuerza.
      const bonus = clamp(s.gd * 22 + (s.pts - s.played * 1.2) * 18, -200, 200);
      eff[s.name] = (BASE_ELO[s.name] ?? DEFAULT_ELO) + bonus;
    }
  }
  return eff;
}

// ── Generador pseudoaleatorio sembrable (mulberry32) ─────────────────────────
// Sembrado con el estado de los datos → mismas probabilidades entre recargas
// mientras no cambien los resultados (UX más estable, menos "baile" de cifras).
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Muestra de una Poisson(λ) por el método de Knuth. Acotada a 7 goles.
function poisson(lambda: number, rng: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return Math.min(k - 1, 7);
}

// Goles medios por equipo y sensibilidad de la diferencia de fuerza.
const MU = 1.35; // ~2.7 goles por partido en total
const THETA = 0.55;

/**
 * Simula el marcador de un partido entre dos equipos según su fuerza.
 * Devuelve goles de cada lado (puede ser empate; el llamador decide penaltis).
 */
export function simulateScore(
  ratingHome: number,
  ratingAway: number,
  rng: () => number
): { h: number; a: number } {
  const d = (ratingHome - ratingAway) / 400;
  const lamH = MU * Math.exp(THETA * d);
  const lamA = MU * Math.exp(-THETA * d);
  return { h: poisson(lamH, rng), a: poisson(lamA, rng) };
}

/** En eliminatoria, si hay empate, decide los penaltis (sesgo leve por fuerza). */
export function shootoutWinner(
  ratingHome: number,
  ratingAway: number,
  rng: () => number
): "home" | "away" {
  const pHome = 1 / (1 + Math.pow(10, -(ratingHome - ratingAway) / 800));
  return rng() < pHome ? "home" : "away";
}
