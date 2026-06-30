import { buildTeamTotals, matchPoints, type Match } from "./scoring";
import { teamName, teamCode } from "./teams";
import type { ApiAllMatch } from "./football-api";
import type { BetDoc } from "./leaderboard";

export interface Award {
  emoji: string;
  title: string;
  winner: string | null;
  value: string;
  blurb: string;
}

export interface StatsResult {
  awards: Award[];
  played: number;
}

const up = (s: string) => s.toUpperCase();
const matchLabel = (m: Match) => `${teamCode(m.home)}-${teamCode(m.away)}`;

/**
 * Estadísticas "de coña" de la porra: premios curiosos calculados a partir de
 * los puntos partido a partido y la evolución de la clasificación.
 */
export function computeStats(
  apiMatches: ApiAllMatch[],
  bets: BetDoc[],
  users: string[]
): StatsResult {
  const betOf = (u: string) => bets.find((b) => b.user === u.toLowerCase());
  const players = users
    .map((u) => ({ user: u, bet: betOf(u) }))
    .filter((p) => p.bet?.confirmed) as { user: string; bet: BetDoc }[];
  const n = players.length;

  const played: Match[] = apiMatches
    .filter(
      (m) =>
        m.played &&
        (m.phase === "groups" || m.phase === "knockout" || m.phase === "third") &&
        m.home !== "Por determinar" &&
        m.away !== "Por determinar"
    )
    .slice()
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
    .map((m) => ({
      id: m.id, home: m.home, away: m.away,
      homeGoals: m.homeGoals ?? 0, awayGoals: m.awayGoals ?? 0,
      phase: m.phase, penalties: m.penalties, played: true,
    }));

  const awards: Award[] = [];
  const blank = (emoji: string, title: string, blurb: string): Award => ({
    emoji, title, winner: null, value: "—", blurb,
  });

  if (n === 0 || played.length === 0) {
    return {
      played: played.length,
      awards: [
        blank("🚀", "El Pelotazo", "Más puntos en un solo partido."),
        blank("💥", "El Hostión", "La mayor enganchada negativa en un partido."),
        blank("🎯", "Ojo Clínico", "El antifavorito que más le ha puntuado en contra."),
        blank("🥄", "Farolillo Rojo de Honor", "Más tiempo siendo el último."),
        blank("👑", "Rey del Mambo", "Más tiempo en lo más alto."),
        blank("🎢", "La Montaña Rusa", "El más inestable de la clasificación."),
        blank("🗿", "Don Previsible", "El más quieto de la tabla."),
        blank("🔥", "On Fire", "Racha más larga sumando positivo."),
        blank("🧊", "El Témpano", "Racha más larga sin rascar nada."),
        blank("🐦‍🔥", "Ave Fénix", "La mayor remontada en la clasificación."),
        blank("🚢", "El Titanic", "El mayor hundimiento en la clasificación."),
        blank("🥈", "El Eterno Segundo", "Mucho subcampeón, nada de oro."),
      ],
    };
  }

  // Puntos por equipo (acumulado) y por partido.
  const teamTotals = buildTeamTotals(played);
  const colPts = played.map((m) => matchPoints(m)); // Record<equipo, pts> por partido

  // perMatch[i][c] = puntos del jugador i en el partido c (favoritos − antis).
  const perMatch = players.map((p) =>
    colPts.map((pts) => {
      const fav = p.bet.favorites.reduce((s, id) => s + (pts[teamName(id)] ?? 0), 0);
      const anti = p.bet.antiFavorites.reduce((s, id) => s + (pts[teamName(id)] ?? 0), 0);
      return fav - anti;
    })
  );

  // Posición de cada jugador tras CADA partido (reconstrucción de la tabla).
  const cum = new Array(n).fill(0);
  const pos = players.map(() => new Array(played.length).fill(0));
  for (let c = 0; c < played.length; c++) {
    for (let i = 0; i < n; i++) cum[i] += perMatch[i][c];
    const order = cum.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    order.forEach((o, rank) => { pos[o.i][c] = rank + 1; });
  }
  const C = played.length;

  // ── 🚀 El Pelotazo: máximo en un partido ──
  let bestI = -1, bestC = -1, bestV = -Infinity;
  let worstI = -1, worstC = -1, worstV = Infinity;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < C; c++) {
      if (perMatch[i][c] > bestV) { bestV = perMatch[i][c]; bestI = i; bestC = c; }
      if (perMatch[i][c] < worstV) { worstV = perMatch[i][c]; worstI = i; worstC = c; }
    }
  }
  awards.push(
    bestV > 0
      ? {
          emoji: "🚀", title: "El Pelotazo",
          winner: players[bestI].user,
          value: `+${bestV} en un partido`,
          blurb: `Su gran tarde: ${up(players[bestI].user)} clavó ${bestV} puntos en ${matchLabel(played[bestC])}. Puro vicio.`,
        }
      : blank("🚀", "El Pelotazo", "Aún nadie ha pegado el pelotazo. Paciencia."),
  );

  // ── 💥 El Hostión: mínimo en un partido ──
  awards.push(
    worstV < 0
      ? {
          emoji: "💥", title: "El Hostión",
          winner: players[worstI].user,
          value: `${worstV} en un partido`,
          blurb: `El día que el VAR le escupió: ${up(players[worstI].user)} se comió ${worstV} en ${matchLabel(played[worstC])}.`,
        }
      : blank("💥", "El Hostión", "De momento nadie se ha pegado el hostión. Tranquis."),
  );

  // ── 🎯 Ojo Clínico: antifavorito propio que más ha puntuado ──
  let ojoI = -1, ojoPts = -Infinity, ojoTeam = "";
  for (let i = 0; i < n; i++) {
    for (const id of players[i].bet.antiFavorites) {
      const t = teamName(id);
      const p = teamTotals[t] ?? 0;
      if (p > ojoPts) { ojoPts = p; ojoI = i; ojoTeam = t; }
    }
  }
  awards.push(
    ojoI >= 0 && ojoPts > 0
      ? {
          emoji: "🎯", title: "Ojo Clínico",
          winner: players[ojoI].user,
          value: `${ojoTeam}: ${ojoPts} pts en contra`,
          blurb: `Puso a ${ojoTeam} de antifavorito y le ha sumado ${ojoPts} puntos EN CONTRA. Qué bien lo viste, campeón.`,
        }
      : blank("🎯", "Ojo Clínico", "De momento los antifavoritos se portan. Milagro."),
  );

  // ── 👑 Rey del Mambo / 🥄 Farolillo / 🥈 Eterno Segundo ──
  const countPos = (i: number, p: number) => pos[i].filter((x) => x === p).length;
  const everWasFirst = (i: number) => pos[i].some((x) => x === 1);

  let kingI = -1, kingN = -1, lastI = -1, lastN = -1;
  for (let i = 0; i < n; i++) {
    const firsts = countPos(i, 1);
    const lasts = countPos(i, n);
    if (firsts > kingN) { kingN = firsts; kingI = i; }
    if (lasts > lastN) { lastN = lasts; lastI = i; }
  }
  awards.push(
    kingN > 0
      ? {
          emoji: "👑", title: "Rey del Mambo",
          winner: players[kingI].user,
          value: `${kingN} partidos como líder`,
          blurb: `Ha dormido ${kingN} partidos en lo más alto. Que se le note la corona.`,
        }
      : blank("👑", "Rey del Mambo", "Nadie ha mandado todavía. Pelea abierta."),
  );
  awards.push(
    lastN > 0
      ? {
          emoji: "🥄", title: "Farolillo Rojo de Honor",
          winner: players[lastI].user,
          value: `${lastN} partidos de farolillo`,
          blurb: `Lleva ${lastN} partidos calentando el farolillo rojo. Todo un clásico del fondo de la tabla.`,
        }
      : blank("🥄", "Farolillo Rojo de Honor", "El farolillo aún busca dueño."),
  );

  let segI = -1, segN = -1;
  for (let i = 0; i < n; i++) {
    if (everWasFirst(i)) continue; // ya probó el oro, no cuenta
    const seconds = countPos(i, 2);
    if (seconds > segN) { segN = seconds; segI = i; }
  }
  awards.push(
    segI >= 0 && segN > 0
      ? {
          emoji: "🥈", title: "El Eterno Segundo",
          winner: players[segI].user,
          value: `${segN} partidos de plata`,
          blurb: `Siempre la dama de honor, nunca la novia: ${segN} partidos en 2º sin probar el oro ni una vez.`,
        }
      : blank("🥈", "El Eterno Segundo", "Todos los de arriba han tocado el oro. Sin víctima."),
  );

  // ── 🎢 Montaña Rusa / 🗿 Don Previsible: movimiento total ──
  const movement = (i: number) => {
    let s = 0;
    for (let c = 1; c < C; c++) s += Math.abs(pos[i][c] - pos[i][c - 1]);
    return s;
  };
  let rcI = -1, rcMax = -1, calmI = -1, calmMin = Infinity;
  for (let i = 0; i < n; i++) {
    const mv = movement(i);
    if (mv > rcMax) { rcMax = mv; rcI = i; }
    if (mv < calmMin) { calmMin = mv; calmI = i; }
  }
  awards.push({
    emoji: "🎢", title: "La Montaña Rusa",
    winner: players[rcI].user,
    value: `${rcMax} saltos de puesto`,
    blurb: `Sube, baja, sube, baja… ${rcMax} cambios de puesto. El que más mareo provoca.`,
  });
  awards.push({
    emoji: "🗿", title: "Don Previsible",
    winner: players[calmI].user,
    value: `${calmMin} saltos de puesto`,
    blurb: `Ni se inmuta: el más quieto de la tabla. Aburrido, pero ahí sigue.`,
  });

  // ── 🔥 On Fire / 🧊 El Témpano: rachas ──
  const streak = (i: number, good: (v: number) => boolean) => {
    let cur = 0, mx = 0;
    for (let c = 0; c < C; c++) {
      if (good(perMatch[i][c])) { cur++; mx = Math.max(mx, cur); } else cur = 0;
    }
    return mx;
  };
  let fireI = -1, fireN = -1, iceI = -1, iceN = -1;
  for (let i = 0; i < n; i++) {
    const f = streak(i, (v) => v > 0);
    const ic = streak(i, (v) => v <= 0);
    if (f > fireN) { fireN = f; fireI = i; }
    if (ic > iceN) { iceN = ic; iceI = i; }
  }
  awards.push(
    fireN > 0
      ? {
          emoji: "🔥", title: "On Fire",
          winner: players[fireI].user,
          value: `${fireN} partidos seguidos sumando`,
          blurb: `${fireN} partidos seguidos rascando puntos. Estaba enchufado a la corriente.`,
        }
      : blank("🔥", "On Fire", "Nadie encadena buenas. Frío general."),
  );
  awards.push({
    emoji: "🧊", title: "El Témpano",
    winner: players[iceI].user,
    value: `${iceN} partidos sin rascar`,
    blurb: `${iceN} partidos seguidos sin sumar nada de nada. Frío, muy frío.`,
  });

  // ── 🐦‍🔥 Ave Fénix / 🚢 El Titanic: remontada y hundimiento ──
  const climb = (i: number) => {
    let worst = -Infinity, mx = 0;
    for (let c = 0; c < C; c++) {
      worst = Math.max(worst, pos[i][c]);
      mx = Math.max(mx, worst - pos[i][c]);
    }
    return mx;
  };
  const drop = (i: number) => {
    let best = Infinity, mx = 0;
    for (let c = 0; c < C; c++) {
      best = Math.min(best, pos[i][c]);
      mx = Math.max(mx, pos[i][c] - best);
    }
    return mx;
  };
  let fenixI = -1, fenixN = -1, titanI = -1, titanN = -1;
  for (let i = 0; i < n; i++) {
    const cl = climb(i), dr = drop(i);
    if (cl > fenixN) { fenixN = cl; fenixI = i; }
    if (dr > titanN) { titanN = dr; titanI = i; }
  }
  awards.push(
    fenixN > 0
      ? {
          emoji: "🐦‍🔥", title: "Ave Fénix",
          winner: players[fenixI].user,
          value: `+${fenixN} puestos remontados`,
          blurb: `Resucitó de sus cenizas: subió ${fenixN} puestos desde su peor momento.`,
        }
      : blank("🐦‍🔥", "Ave Fénix", "Nadie ha remontado todavía. Sin milagros."),
  );
  awards.push(
    titanN > 0
      ? {
          emoji: "🚢", title: "El Titanic",
          winner: players[titanI].user,
          value: `−${titanN} puestos hundidos`,
          blurb: `Tocó fondo: se desplomó ${titanN} puestos desde su mejor momento. Y la orquesta seguía tocando.`,
        }
      : blank("🚢", "El Titanic", "Nadie se ha hundido aún. Mar en calma."),
  );

  return { awards, played: played.length };
}
