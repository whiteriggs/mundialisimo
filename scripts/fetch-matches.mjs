// scripts/fetch-matches.mjs
// Llamado en prebuild — guarda public/matches.json con todos los partidos del WC
// Se ejecuta en Node.js (sin CORS), así que la API responde correctamente.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "public/matches.json");
const OUT_STANDINGS = join(ROOT, "public/standings.json");

// Leer .env.local si existe (para desarrollo local)
const envLocal = join(ROOT, ".env.local");
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] ??= match[2].trim();
  }
}

const API_KEY = process.env.NEXT_PUBLIC_FOOTBALL_DATA_KEY ?? "";
const URL = "https://api.football-data.org/v4/competitions/WC/matches";

const NAME_MAP = {
  Mexico: "México", "South Africa": "Sudáfrica", "Korea Republic": "Rep. Corea",
  "Republic of Korea": "Rep. Corea", "South Korea": "Rep. Corea",
  Czechia: "Rep. Checa", "Czech Republic": "Rep. Checa", Canada: "Canadá",
  "Bosnia and Herzegovina": "Bosnia y Herz.", "Bosnia-Herzegovina": "Bosnia y Herz.", Qatar: "Catar", Switzerland: "Suiza",
  Brazil: "Brasil", Morocco: "Marruecos", Haiti: "Haití", Scotland: "Escocia",
  "United States": "EE.UU.", USA: "EE.UU.", Australia: "Australia",
  Turkey: "Turquía", Türkiye: "Turquía", Germany: "Alemania",
  "Ivory Coast": "Costa Marfil", "Côte d'Ivoire": "Costa Marfil",
  Ecuador: "Ecuador", Curaçao: "Curazao", Curacao: "Curazao",
  Netherlands: "Países Bajos", Japan: "Japón", Sweden: "Suecia",
  Tunisia: "Túnez", Belgium: "Bélgica", Egypt: "Egipto", Iran: "Irán",
  "New Zealand": "Nueva Zelanda", Spain: "España", Uruguay: "Uruguay",
  "Saudi Arabia": "Arabia Saudí", "Cape Verde": "Cabo Verde", "Cape Verde Islands": "Cabo Verde", France: "Francia",
  Norway: "Noruega", Senegal: "Senegal", Iraq: "Irak", Argentina: "Argentina",
  Austria: "Austria", Algeria: "Argelia", Jordan: "Jordania", Portugal: "Portugal",
  Colombia: "Colombia", "Congo DR": "RD Congo", "DR Congo": "RD Congo",
  "Democratic Republic of Congo": "RD Congo", Uzbekistan: "Uzbekistán",
  England: "Inglaterra", Croatia: "Croacia", Ghana: "Ghana", Panama: "Panamá",
  Paraguay: "Paraguay",
};

function toName(n) { return NAME_MAP[n] ?? n; }

function stageToPhase(stage) {
  if (stage === "GROUP_STAGE") return "groups";
  if (stage === "THIRD_PLACE") return "third";
  return "knockout";
}

async function main() {
  if (!API_KEY) {
    console.warn("[fetch-matches] Sin API key — se omite la generación de matches.json");
    return;
  }
  try {
    const res = await fetch(URL, { headers: { "X-Auth-Token": API_KEY } });
    if (!res.ok) {
      console.warn(`[fetch-matches] API ${res.status} — se omite matches.json`);
      return;
    }
    const data = await res.json();
    const matches = (data.matches ?? [])
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
      .map((m) => ({
        id: String(m.id),
        utcDate: m.utcDate,
        status: m.status,
        stage: m.stage,
        home: m.homeTeam?.name ? toName(m.homeTeam.name) : "Por determinar",
        away: m.awayTeam?.name ? toName(m.awayTeam.name) : "Por determinar",
        homeGoals: m.score?.fullTime?.home ?? null,
        awayGoals: m.score?.fullTime?.away ?? null,
        phase: stageToPhase(m.stage),
        penalties: m.score?.duration === "PENALTY_SHOOTOUT",
        played: m.status === "FINISHED",
      }));

    mkdirSync(join(__dirname, "../public"), { recursive: true });
    writeFileSync(OUT, JSON.stringify(matches));
    console.log(`[fetch-matches] OK — ${matches.length} partidos → public/matches.json`);
  } catch (err) {
    console.warn("[fetch-matches] Error:", err.message, "— se omite matches.json");
  }

  // ── Standings ────────────────────────────────────────────────────────────
  try {
    const sRes = await fetch(
      `https://api.football-data.org/v4/competitions/WC/standings`,
      { headers: { "X-Auth-Token": API_KEY } }
    );
    if (!sRes.ok) {
      console.warn(`[fetch-matches] standings API ${sRes.status} — se omite standings.json`);
    } else {
      const sData = await sRes.json();
      const groups = (sData.standings ?? [])
        .filter((s) => s.stage === "GROUP_STAGE" && s.type === "TOTAL")
        .map((s) => ({
          group: s.group,
          table: (s.table ?? []).map((row) => ({
            position: row.position,
            team: { name: toName(row.team?.name ?? "") || row.team?.name },
            playedGames: row.playedGames,
            won: row.won,
            draw: row.draw,
            lost: row.lost,
            goalsFor: row.goalsFor,
            goalsAgainst: row.goalsAgainst,
            goalDifference: row.goalDifference,
            points: row.points,
          })),
        }));
      writeFileSync(OUT_STANDINGS, JSON.stringify(groups));
      console.log(`[fetch-matches] OK — ${groups.length} grupos → public/standings.json`);
    }
  } catch (err) {
    console.warn("[fetch-matches] standings Error:", err.message, "— se omite standings.json");
  }
}

main();
