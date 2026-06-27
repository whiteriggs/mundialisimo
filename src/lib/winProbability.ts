import { BRACKET_2026, type Side } from "./simulateBracket";
import { buildGroupStandings, type TeamStanding } from "./standings";
import { buildTeamTotals, calcUserScore, type Match } from "./scoring";
import { teamName } from "./teams";
import { effectiveRatings, mulberry32, simulateScore, shootoutWinner } from "./strength";
import type { ApiAllMatch } from "./football-api";
import type { BetDoc } from "./leaderboard";

const TBD = "Por determinar";
const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export interface UserProbability {
  user: string;
  winPct: number;     // % de quedar 1º (gana la porra)
  podiumPct: number;  // % de quedar entre los 3 primeros
  lastPct: number;    // % de quedar último (farolillo)
  meanScore: number;  // puntos finales esperados (media)
  aliveFav: number;   // favoritos aún no eliminados
  totalFav: number;
  aliveAnti: number;  // antifavoritos aún no eliminados
  totalAnti: number;
}

export interface ProbabilityResult {
  users: UserProbability[];
  sims: number;
}

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

// ── Equipos ya eliminados (a partir de los resultados REALES) ────────────────
// Se usa solo para el contador "favoritos/antifavoritos vivos", no para el
// Monte Carlo. Criterio conservador: solo se marca eliminado cuando es seguro.
function computeEliminated(realGroup: Match[], realKO: Match[]): Set<string> {
  const elim = new Set<string>();

  // Perdedores de eliminatoria (si el resultado no fue empate; el desempate por
  // penaltis real no consta en la API, así que en empate no marcamos a nadie).
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
    const t = standings[g];
    // El 4º de un grupo completo está eliminado con seguridad.
    elim.add(t[3].name);
  }

  // Mejores terceros: solo cuando TODOS los grupos están completos se sabe qué
  // terceros quedan fuera (los que no entran en el top-8).
  if (allComplete) {
    const thirds = GROUP_LETTERS.map((g) => standings[g][2]).sort(thirdsCmp);
    thirds.slice(8).forEach((t) => elim.add(t.name));
  }

  return elim;
}

const thirdsCmp = (a: TeamStanding, b: TeamStanding) =>
  b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name, "es");

// ── Resuelve el cuadro de eliminatorias en UNA simulación ────────────────────
// standings: clasificación (real + grupos simulados) de esa simulación.
// eff: fuerza efectiva de cada equipo. realKO: resultados KO reales por pareja.
// Devuelve los Match puntuables de toda la fase final (incl. 3.º y 4.º puesto).
function resolveBracket(
  standings: Record<string, TeamStanding[]>,
  eff: Record<string, number>,
  realKO: Map<string, { h: number; a: number }>,
  rng: () => number
): Match[] {
  const thirds = GROUP_LETTERS.map((g) => ({ group: g, t: standings[g]?.[2] }))
    .filter((x) => x.t)
    .sort((x, y) => thirdsCmp(x.t, y.t));
  const qualifiedThirds = new Set(thirds.slice(0, 8).map((x) => x.group));
  const usedThirds = new Set<string>();

  const winnerTeam: Record<string, string> = {};
  const sides: Record<string, { home: string; away: string }> = {};

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

  const playKnockout = (id: string, home: string, away: string, phase: "knockout" | "third") => {
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
      id: `ko-${id}`,
      home,
      away,
      homeGoals: h,
      awayGoals: a,
      phase,
      penalties: h === a, // empate → resuelto en penaltis
      played: true,
    });
  };

  for (const def of BRACKET_2026) {
    const home = resolveSide(def.home);
    const away = resolveSide(def.away);
    if (home === TBD || away === TBD) continue;
    sides[def.id] = { home, away };
    playKnockout(def.id, home, away, "knockout");
  }

  // 3.º y 4.º puesto: perdedores de las dos semifinales (101 y 102).
  const sf1 = sides["101"];
  const sf2 = sides["102"];
  if (sf1 && sf2 && winnerTeam["101"] && winnerTeam["102"]) {
    const loser1 = winnerTeam["101"] === sf1.home ? sf1.away : sf1.home;
    const loser2 = winnerTeam["102"] === sf2.home ? sf2.away : sf2.home;
    playKnockout("103", loser1, loser2, "third");
  }

  return out;
}

/**
 * Monte Carlo: simula el resto del torneo N veces y calcula, para cada
 * participante, la probabilidad de ganar la porra, de podio, de quedar último
 * y su puntuación media. Solo entran participantes con apuesta confirmada.
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

  // Partidos reales por tipo.
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

  const result: ProbabilityResult = {
    sims,
    users: players.map((p) => {
      const fav = p.bet.favorites;
      const anti = p.bet.antiFavorites;
      return {
        user: p.user,
        winPct: 0, podiumPct: 0, lastPct: 0, meanScore: 0,
        aliveFav: fav.filter((t) => !eliminated.has(teamName(t))).length,
        totalFav: fav.length,
        aliveAnti: anti.filter((t) => !eliminated.has(teamName(t))).length,
        totalAnti: anti.length,
      };
    }),
  };

  if (players.length === 0) return result;

  // Fuerza efectiva (estable durante todo el Monte Carlo).
  const eff = effectiveRatings(realGroup);

  // Resultados KO reales por pareja, para respetarlos en cada simulación.
  const realKO = new Map<string, { h: number; a: number }>();
  for (const m of realKOList) realKO.set(pairKey(m.home, m.away), { h: m.homeGoals, a: m.awayGoals });

  // Semilla a partir del estado de los datos (estable entre recargas).
  const seed =
    realGroup.length * 131 +
    realKOList.length * 977 +
    realGroup.reduce((s, m) => s + m.homeGoals + m.awayGoals, 0) * 13 +
    1;
  const rng = mulberry32(seed);

  const winCount = new Array(players.length).fill(0);
  const podiumCount = new Array(players.length).fill(0);
  const lastCount = new Array(players.length).fill(0);
  const scoreSum = new Array(players.length).fill(0);

  for (let s = 0; s < sims; s++) {
    // 1. Simula los partidos de grupo que faltan.
    const simGroup: Match[] = remGroup.map((m) => {
      const { h, a } = simulateScore(eff[m.home] ?? 1600, eff[m.away] ?? 1600, rng);
      return {
        id: m.id, home: m.home, away: m.away,
        homeGoals: h, awayGoals: a, phase: "groups" as const, penalties: false, played: true,
      };
    });

    // 2. Clasificación de grupos (real + simulada) y cuadro de eliminatorias.
    const standings = buildGroupStandings([...realGroup, ...simGroup]);
    const koMatches = resolveBracket(standings, eff, realKO, rng);

    // 3. Puntos por equipo en este torneo simulado.
    const totals = buildTeamTotals([...realGroup, ...simGroup, ...koMatches]);

    // 4. Puntuación de cada participante y ranking.
    const scores = players.map((p) => calcUserScore(p.bet.favorites, p.bet.antiFavorites, totals));
    let maxScore = -Infinity;
    let minScore = Infinity;
    for (const v of scores) {
      if (v > maxScore) maxScore = v;
      if (v < minScore) minScore = v;
    }
    // Posición (1 = mejor) por puntuación descendente, con reparto en empates.
    const order = scores.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);

    const winners = scores.reduce((n, v) => (v === maxScore ? n + 1 : n), 0);
    const losers = scores.reduce((n, v) => (v === minScore ? n + 1 : n), 0);
    for (let i = 0; i < players.length; i++) {
      scoreSum[i] += scores[i];
      if (scores[i] === maxScore) winCount[i] += 1 / winners;
      if (scores[i] === minScore) lastCount[i] += 1 / losers;
    }
    // Podio: las 3 primeras posiciones del orden (empates resueltos por el sort).
    for (let k = 0; k < Math.min(3, order.length); k++) podiumCount[order[k].i] += 1;
  }

  for (let i = 0; i < players.length; i++) {
    result.users[i].winPct = (winCount[i] / sims) * 100;
    result.users[i].podiumPct = (podiumCount[i] / sims) * 100;
    result.users[i].lastPct = (lastCount[i] / sims) * 100;
    result.users[i].meanScore = scoreSum[i] / sims;
  }
  result.users.sort((a, b) => b.winPct - a.winPct || b.meanScore - a.meanScore);
  return result;
}
