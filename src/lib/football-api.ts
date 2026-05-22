import { Match, Phase } from "./scoring";

const API_KEY = process.env.NEXT_PUBLIC_FOOTBALL_DATA_KEY ?? "";
const BASE = "https://api.football-data.org/v4";
const COMPETITION = "WC";

// ── Name mapping: football-data.org English names → our Spanish names ──────
export const API_NAME_MAP: Record<string, string> = {
  Mexico: "México",
  "South Africa": "Sudáfrica",
  "Korea Republic": "Rep. Corea",
  "Republic of Korea": "Rep. Corea",
  "South Korea": "Rep. Corea",
  Czechia: "Rep. Checa",
  "Czech Republic": "Rep. Checa",
  Canada: "Canadá",
  "Bosnia and Herzegovina": "Bosnia y Herz.",
  Qatar: "Catar",
  Switzerland: "Suiza",
  Brazil: "Brasil",
  Morocco: "Marruecos",
  Haiti: "Haití",
  Scotland: "Escocia",
  "United States": "EE.UU.",
  USA: "EE.UU.",
  Paraguay: "Paraguay",
  Australia: "Australia",
  Turkey: "Turquía",
  Türkiye: "Turquía",
  Germany: "Alemania",
  "Ivory Coast": "Costa Marfil",
  "Côte d'Ivoire": "Costa Marfil",
  Ecuador: "Ecuador",
  Curaçao: "Curazao",
  Curacao: "Curazao",
  Netherlands: "Países Bajos",
  Japan: "Japón",
  Sweden: "Suecia",
  Tunisia: "Túnez",
  Belgium: "Bélgica",
  Egypt: "Egipto",
  Iran: "Irán",
  "New Zealand": "Nueva Zelanda",
  Spain: "España",
  Uruguay: "Uruguay",
  "Saudi Arabia": "Arabia Saudí",
  "Cape Verde": "Cabo Verde",
  France: "Francia",
  Norway: "Noruega",
  Senegal: "Senegal",
  Iraq: "Irak",
  Argentina: "Argentina",
  Austria: "Austria",
  Algeria: "Argelia",
  Jordan: "Jordania",
  Portugal: "Portugal",
  Colombia: "Colombia",
  "Congo DR": "RD Congo",
  "DR Congo": "RD Congo",
  "Democratic Republic of Congo": "RD Congo",
  Uzbekistan: "Uzbekistán",
  England: "Inglaterra",
  Croatia: "Croacia",
  Ghana: "Ghana",
  Panama: "Panamá",
};

export function toInternalName(apiName: string): string {
  return API_NAME_MAP[apiName] ?? apiName;
}

// ── Standings ──────────────────────────────────────────────────────────────
export type ApiTableRow = {
  position: number;
  team: { name: string };
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export type ApiStandingGroup = {
  group: string; // "GROUP_A", "GROUP_B", …
  table: ApiTableRow[];
};

export async function fetchGroupStandings(): Promise<ApiStandingGroup[]> {
  const res = await fetch(`${BASE}/competitions/${COMPETITION}/standings`, {
    headers: { "X-Auth-Token": API_KEY },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`football-data.org ${res.status}: ${text}`);
  }
  const data = await res.json();
  // Only group-stage total standings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.standings as any[]).filter(
    (s) => s.stage === "GROUP_STAGE" && s.type === "TOTAL"
  ) as ApiStandingGroup[];
}

// ── Matches ────────────────────────────────────────────────────────────────
type ApiMatch = {
  id: number;
  stage: string;
  status: string;
  homeTeam: { name: string };
  awayTeam: { name: string };
  score: {
    winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
    fullTime: { home: number | null; away: number | null };
  };
};

function stageToPhase(stage: string): Phase {
  if (stage === "GROUP_STAGE") return "groups";
  if (stage === "THIRD_PLACE") return "third";
  return "knockout";
}

export async function fetchFinishedMatches(): Promise<Match[]> {
  const res = await fetch(
    `${BASE}/competitions/${COMPETITION}/matches?status=FINISHED`,
    { headers: { "X-Auth-Token": API_KEY } }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`football-data.org ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.matches as ApiMatch[]).map((m): Match => ({
    id: String(m.id),
    home: toInternalName(m.homeTeam.name),
    away: toInternalName(m.awayTeam.name),
    homeGoals: m.score.fullTime.home ?? 0,
    awayGoals: m.score.fullTime.away ?? 0,
    phase: stageToPhase(m.stage),
    penalties: m.score.duration === "PENALTY_SHOOTOUT",
    played: true,
  }));
}

// ── Knockout bracket ───────────────────────────────────────────────────────
const KNOCKOUT_STAGES = new Set([
  "ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINALS", "SEMI_FINALS", "FINAL",
]);

export type ApiKnockoutMatch = {
  id: string;
  stage: string;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
  finished: boolean;
  penalties: boolean;
  date: string;
  winner: "home" | "away" | null;
};

export async function fetchKnockoutMatches(): Promise<ApiKnockoutMatch[]> {
  const res = await fetch(
    `${BASE}/competitions/${COMPETITION}/matches`,
    { headers: { "X-Auth-Token": API_KEY } }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`football-data.org ${res.status}: ${text}`);
  }
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.matches as any[])
    .filter((m) => KNOCKOUT_STAGES.has(m.stage))
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())
    .map((m): ApiKnockoutMatch => ({
      id: String(m.id),
      stage: m.stage,
      home: m.homeTeam?.name ? toInternalName(m.homeTeam.name) : "Por determinar",
      away: m.awayTeam?.name ? toInternalName(m.awayTeam.name) : "Por determinar",
      homeGoals: m.score?.fullTime?.home ?? null,
      awayGoals: m.score?.fullTime?.away ?? null,
      finished: m.status === "FINISHED",
      penalties: m.score?.duration === "PENALTY_SHOOTOUT",
      date: new Date(m.utcDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
      winner:
        m.status === "FINISHED"
          ? m.score?.winner === "HOME_TEAM"
            ? "home"
            : m.score?.winner === "AWAY_TEAM"
            ? "away"
            : null
          : null,
    }));
}
