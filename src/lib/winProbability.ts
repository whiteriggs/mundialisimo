import { BRACKET_2026, type Side } from "./simulateBracket";
import { buildGroupStandings, type TeamStanding } from "./standings";
import { buildTeamTotals, calcUserScore, type Match } from "./scoring";
import { teamName } from "./teams";
import { effectiveRatings, mulberry32, simulateScore, shootoutWinner } from "./strength";
import type { ApiAllMatch } from "./football-api";
import type { BetDoc } from "./leaderboard";

const TBD = "Por determinar";
const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export interface TeamContribution {
  team: string;
  pts: number; // puntos esperados que ese equipo aporta (media por simulación)
}

export interface UserProbability {
  user: string;
  winPct: number;     // % de quedar 1º (gana la porra)
  podiumPct: number;  // % de quedar entre los 3 primeros
  lastPct: number;    // % de quedar último (farolillo)
  meanScore: number;  // puntos finales esperados (media)
  p10: number;        // puntos en el 10% peor de escenarios
  p90: number;        // puntos en el 10% mejor de escenarios
  posDist: number[];  // P(quedar en el puesto k+1), en %, k = 0..n-1
  bestPos: number;    // puesto más probable (1 = primero)
  mvp: TeamContribution | null;    // favorito que más le aporta
  lastre: TeamContribution | null; // antifavorito que más le resta
  aliveFav: number;   // favoritos aún no eliminados
  totalFav: number;
  aliveAnti: number;  // antifavoritos aún no eliminados
  totalAnti: number;
  beats: { user: string; pct: number }[]; // % de quedar por encima de cada rival
}

export interface TeamProbability {
  team: string;
  championPct: number;
  finalPct: number;
  semiPct: number;
}

export interface ProbabilityResult {
  users: UserProbability[];
  teams: TeamProbability[];
  sims: number;
}

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

// ── Equipos ya eliminados (a partir de los resultados REALES) ────────────────
function computeEliminated(realGroup: Match[], realKO: Match[]): Set<string> {
  const elim = new Set<string>();
  for (const m of realKO) {
    if (m.homeGoals > m.awayGoals) elim.add(m.away);
    else if (m.awayGoals > m.homeGoals) elim.add(m.home);
  }
  const standings = buildGroupStandings(realGroup);
  const groupComplete = (g: string) => {
    const t = standings[g];
    return !!t && t.length === 4 && t.every((x) => x.played >= 3);
  };
  const allComplete = GROUP_LETTERS.every(groupComplete);
  for (const g of GROUP_LETTERS) {
    if (!groupComplete(g)) continue;
    elim.add(standings[g][3].name);
  }
  if (allComplete) {
    const thirds = GROUP_LETTERS.map((g) => standings[g][2]).sort(thirdsCmp);
    thirds.slice(8).forEach((t) => elim.add(t.name));
  }
  return elim;
}

const thirdsCmp = (a: TeamStanding, b: TeamStanding) =>
  b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name, "es");

interface BracketOutcome {
  matches: Match[];
  champion: string | null;
  finalists: string[];
  semifinalists: string[];
}

// ── Resuelve el cuadro de eliminatorias en UNA simulación ────────────────────
// realR32Slots: si el sorteo de dieciseisavos ya está hecho, fija los cruces
// reales (id de partido FIFA → equipos) para que la simulación use el cuadro
// oficial en vez de re-derivar los terceros. Si está vacío, se deriva de la
// clasificación (como antes de que acabe la fase de grupos).
function resolveBracket(
  standings: Record<string, TeamStanding[]>,
  eff: Record<string, number>,
  realKO: Map<string, { h: number; a: number }>,
  rng: () => number,
  realR32Slots: Record<string, { home: string; away: string }> = {}
): BracketOutcome {
  const thirds = GROUP_LETTERS.map((g) => ({ group: g, t: standings[g]?.[2] }))
    .filter((x) => x.t)
    .sort((x, y) => thirdsCmp(x.t, y.t));
  const qualifiedThirds = new Set(thirds.slice(0, 8).map((x) => x.group));
  const usedThirds = new Set<string>();

  const winnerTeam: Record<string, string> = {};
  const sides: Record<string, { home: string; away: string; round: string }> = {};

  const resolveSide = (side: Side): string => {
    if (side.kind === "group") return standings[side.group]?.[side.pos - 1]?.name ?? TBD;
    if (side.kind === "third") {
      for (const x of thirds) {
        if (side.candidates.includes(x.group) && qualifiedThirds.has(x.group) && !usedThirds.has(x.group)) {
          usedThirds.add(x.group);
          return x.t.name;
        }
      }
      return TBD;
    }
    return winnerTeam[side.match] ?? TBD;
  };

  const out: Match[] = [];

  const play = (id: string, home: string, away: string, phase: "knockout" | "third") => {
    let h: number;
    let a: number;
    const real = realKO.get(pairKey(home, away));
    if (real) {
      h = real.h;
      a = real.a;
    } else {
      ({ h, a } = simulateScore(eff[home] ?? 1600, eff[away] ?? 1600, rng));
    }
    let winnerSide: "home" | "away";
    if (h > a) winnerSide = "home";
    else if (a > h) winnerSide = "away";
    else winnerSide = shootoutWinner(eff[home] ?? 1600, eff[away] ?? 1600, rng);
    winnerTeam[id] = winnerSide === "home" ? home : away;
    out.push({
      id: `ko-${id}`, home, away, homeGoals: h, awayGoals: a,
      phase, penalties: h === a, played: true,
    });
  };

  for (const def of BRACKET_2026) {
    const fixed = realR32Slots[def.id];
    const home = fixed ? fixed.home : resolveSide(def.home);
    const away = fixed ? fixed.away : resolveSide(def.away);
    if (home === TBD || away === TBD) continue;
    sides[def.id] = { home, away, round: def.round };
    play(def.id, home, away, "knockout");
  }

  // 3.º y 4.º puesto: perdedores de las semifinales.
  const sf1 = sides["101"];
  const sf2 = sides["102"];
  const semifinalists: string[] = [];
  if (sf1) semifinalists.push(sf1.home, sf1.away);
  if (sf2) semifinalists.push(sf2.home, sf2.away);
  if (sf1 && sf2 && winnerTeam["101"] && winnerTeam["102"]) {
    const loser1 = winnerTeam["101"] === sf1.home ? sf1.away : sf1.home;
    const loser2 = winnerTeam["102"] === sf2.home ? sf2.away : sf2.home;
    play("103", loser1, loser2, "third");
  }

  const fin = sides["104"];
  const finalists = fin ? [fin.home, fin.away] : [];

  return { matches: out, champion: winnerTeam["104"] ?? null, finalists, semifinalists };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

// Mapea los dieciseisavos REALES (ya sorteados) a su hueco del cuadro FIFA, por
// "ancla": cada hueco tiene un lado 1º/2º de grupo ya conocido; el partido real
// que contiene ese equipo es el de ese hueco. Así la simulación parte del cuadro
// oficial (terceros incluidos) en vez de re-derivarlo. Vacío si aún no hay sorteo.
function buildRealR32Slots(
  apiMatches: ApiAllMatch[],
  standings: Record<string, TeamStanding[]>
): Record<string, { home: string; away: string }> {
  const real = apiMatches.filter(
    (m) =>
      (m.stage === "LAST_32" || m.stage === "ROUND_OF_32") &&
      m.home !== TBD && m.away !== TBD
  );
  if (real.length === 0) return {};
  const anchorOf = (side: Side): string | null =>
    side.kind === "group" ? standings[side.group]?.[side.pos - 1]?.name ?? null : null;
  const out: Record<string, { home: string; away: string }> = {};
  for (const def of BRACKET_2026) {
    if (def.round !== "R32") continue;
    const anchors = [anchorOf(def.home), anchorOf(def.away)].filter(Boolean) as string[];
    const rm = real.find((m) => anchors.includes(m.home) || anchors.includes(m.away));
    if (rm) out[def.id] = { home: rm.home, away: rm.away };
  }
  return out;
}

/**
 * Monte Carlo: simula el resto del torneo N veces y calcula, para cada
 * participante, todas las métricas de la pestaña de probabilidades.
 */
export function computeWinProbabilities(
  apiMatches: ApiAllMatch[],
  bets: BetDoc[],
  users: string[],
  sims = 5000
): ProbabilityResult {
  const betOf = (u: string) => bets.find((b) => b.user === u.toLowerCase());
  const players = users
    .map((u) => ({ user: u, bet: betOf(u) }))
    .filter((p) => p.bet?.confirmed) as { user: string; bet: BetDoc }[];
  const n = players.length;

  const toMatch = (m: ApiAllMatch, phase: Match["phase"]): Match => ({
    id: m.id, home: m.home, away: m.away,
    homeGoals: m.homeGoals ?? 0, awayGoals: m.awayGoals ?? 0,
    phase, penalties: m.penalties, played: true,
  });
  const realGroup = apiMatches
    .filter((m) => m.played && m.phase === "groups")
    .map((m) => toMatch(m, "groups"));
  const realKOList = apiMatches
    .filter((m) => m.played && (m.phase === "knockout" || m.phase === "third"))
    .map((m) => toMatch(m, m.phase));
  const remGroup = apiMatches.filter(
    (m) => !m.played && m.phase === "groups" && m.home !== TBD && m.away !== TBD
  );

  const eliminated = computeEliminated(realGroup, realKOList);

  const base: ProbabilityResult = {
    sims,
    teams: [],
    users: players.map((p) => ({
      user: p.user,
      winPct: 0, podiumPct: 0, lastPct: 0, meanScore: 0, p10: 0, p90: 0,
      posDist: new Array(Math.max(n, 1)).fill(0), bestPos: 1,
      mvp: null, lastre: null,
      aliveFav: p.bet.favorites.filter((t) => !eliminated.has(teamName(t))).length,
      totalFav: p.bet.favorites.length,
      aliveAnti: p.bet.antiFavorites.filter((t) => !eliminated.has(teamName(t))).length,
      totalAnti: p.bet.antiFavorites.length,
      beats: [],
    })),
  };
  if (n === 0) return base;

  const eff = effectiveRatings(realGroup);

  // Si los dieciseisavos ya están sorteados, fijamos el cuadro real (terceros
  // incluidos) para que la simulación parta del bracket oficial.
  const realR32Slots = buildRealR32Slots(apiMatches, buildGroupStandings(realGroup));

  const realKO = new Map<string, { h: number; a: number }>();
  for (const m of realKOList) realKO.set(pairKey(m.home, m.away), { h: m.homeGoals, a: m.awayGoals });

  const seed =
    realGroup.length * 131 + realKOList.length * 977 +
    realGroup.reduce((s, m) => s + m.homeGoals + m.awayGoals, 0) * 13 + 1;
  const rng = mulberry32(seed);

  // Acumuladores
  const winCount = new Array(n).fill(0);
  const podiumCount = new Array(n).fill(0);
  const lastCount = new Array(n).fill(0);
  const scoreSum = new Array(n).fill(0);
  const posCount = Array.from({ length: n }, () => new Array(n).fill(0));
  const allScores = Array.from({ length: n }, () => new Array<number>(sims));
  const beatCount = Array.from({ length: n }, () => new Array(n).fill(0)); // beatCount[i][j] = veces que i > j
  const teamPointsSum: Record<string, number> = {};
  const champCount: Record<string, number> = {};
  const finalCount: Record<string, number> = {};
  const semiCount: Record<string, number> = {};
  const bump = (rec: Record<string, number>, k: string | null | undefined) => {
    if (k) rec[k] = (rec[k] ?? 0) + 1;
  };

  for (let s = 0; s < sims; s++) {
    const simGroup: Match[] = remGroup.map((m) => {
      const { h, a } = simulateScore(eff[m.home] ?? 1600, eff[m.away] ?? 1600, rng);
      return {
        id: m.id, home: m.home, away: m.away,
        homeGoals: h, awayGoals: a, phase: "groups" as const, penalties: false, played: true,
      };
    });

    const standings = buildGroupStandings([...realGroup, ...simGroup]);
    const bracket = resolveBracket(standings, eff, realKO, rng, realR32Slots);

    const totals = buildTeamTotals([...realGroup, ...simGroup, ...bracket.matches]);
    for (const t in totals) teamPointsSum[t] = (teamPointsSum[t] ?? 0) + totals[t];

    bump(champCount, bracket.champion);
    for (const t of bracket.finalists) bump(finalCount, t);
    for (const t of bracket.semifinalists) bump(semiCount, t);

    // Puntuación y ranking de los participantes en este torneo.
    const scores = players.map((p) => calcUserScore(p.bet.favorites, p.bet.antiFavorites, totals));
    for (let i = 0; i < n; i++) {
      scoreSum[i] += scores[i];
      allScores[i][s] = scores[i];
      for (let j = 0; j < n; j++) if (i !== j && scores[i] > scores[j]) beatCount[i][j]++;
    }
    const order = scores.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    for (let k = 0; k < n; k++) {
      const idx = order[k].i;
      posCount[idx][k]++;
      if (k === 0) winCount[idx]++;
      if (k < 3) podiumCount[idx]++;
    }
    lastCount[order[n - 1].i]++;
  }

  // Puntos esperados por equipo (para MVP / lastre).
  const expTeam: Record<string, number> = {};
  for (const t in teamPointsSum) expTeam[t] = teamPointsSum[t] / sims;
  const bestTeam = (ids: string[]): TeamContribution | null => {
    let best: TeamContribution | null = null;
    for (const id of ids) {
      const nm = teamName(id);
      const pts = expTeam[nm] ?? 0;
      if (!best || pts > best.pts) best = { team: nm, pts };
    }
    return best;
  };

  for (let i = 0; i < n; i++) {
    const u = base.users[i];
    u.winPct = (winCount[i] / sims) * 100;
    u.podiumPct = (podiumCount[i] / sims) * 100;
    u.lastPct = (lastCount[i] / sims) * 100;
    u.meanScore = scoreSum[i] / sims;
    const sorted = allScores[i].slice().sort((a, b) => a - b);
    u.p10 = percentile(sorted, 0.1);
    u.p90 = percentile(sorted, 0.9);
    u.posDist = posCount[i].map((c) => (c / sims) * 100);
    u.bestPos = u.posDist.reduce((bi, v, k, arr) => (v > arr[bi] ? k : bi), 0) + 1;
    u.mvp = bestTeam(players[i].bet.favorites);
    u.lastre = bestTeam(players[i].bet.antiFavorites);
    u.beats = players
      .map((p, j) => ({ user: p.user, pct: i === j ? 0 : (beatCount[i][j] / sims) * 100, j }))
      .filter((x) => x.j !== i)
      .map(({ user, pct }) => ({ user, pct }))
      .sort((a, b) => b.pct - a.pct);
  }
  base.users.sort((a, b) => b.winPct - a.winPct || b.meanScore - a.meanScore);

  // Probabilidades por selección (campeón / finalista / semifinalista).
  const teamSet = new Set<string>([
    ...Object.keys(champCount), ...Object.keys(finalCount), ...Object.keys(semiCount),
  ]);
  base.teams = [...teamSet]
    .map((team) => ({
      team,
      championPct: ((champCount[team] ?? 0) / sims) * 100,
      finalPct: ((finalCount[team] ?? 0) / sims) * 100,
      semiPct: ((semiCount[team] ?? 0) / sims) * 100,
    }))
    .sort((a, b) => b.championPct - a.championPct || b.finalPct - a.finalPct);

  return base;
}
