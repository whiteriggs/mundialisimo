// Canales de televisión por partido (España) para el Mundial 2026.
//
// Modelo real (fuente: reparto publicado por partidosmundial.com):
//   • DAZN emite TODOS los partidos (de pago).
//   • RTVE (La1, en abierto) emite solo los partidos en los que juega uno de
//     los equipos del acuerdo de emisión en abierto (RTVE_TEAMS).
//
// Nota: la lista de equipos en abierto es la estimación de esa web según el
// acuerdo de RTVE para el Mundial 2026; puede ajustarse si hay datos oficiales.

export type TvChannel = {
  name: string;
  kind: "gratis" | "pago";
  url: string;
};

const RTVE: TvChannel = {
  name: "RTVE",
  kind: "gratis",
  url: "https://www.rtve.es/play/directo/",
};

const DAZN: TvChannel = {
  name: "DAZN",
  kind: "pago",
  url: "https://www.dazn.com/",
};

// Equipos cuyos partidos emite RTVE en abierto (nombres tal y como aparecen en
// los datos de Mundialísimo).
const RTVE_TEAMS = new Set([
  "España",
  "México",
  "EE.UU.",
  "Canadá",
  "Brasil",
  "Argentina",
  "Francia",
  "Alemania",
  "Portugal",
  "Inglaterra",
  "Países Bajos",
  "Bélgica",
  "Uruguay",
]);

export function tvChannelsFor(match: { home: string; away: string }): TvChannel[] {
  const onRtve = RTVE_TEAMS.has(match.home) || RTVE_TEAMS.has(match.away);
  return onRtve ? [RTVE, DAZN] : [DAZN];
}
