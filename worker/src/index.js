// Cloudflare Worker — proxy en vivo para football-data.org
//
// Por qué existe: el plan gratuito de football-data.org no permite CORS desde
// el navegador y entrega marcadores en directo de forma intermitente (a veces
// devuelve `null` aunque ya hubo resultado). Este Worker:
//   • Llama a la API con la key guardada como secret (nunca expuesta al cliente).
//   • Cachea en el edge ~30 s, así da igual cuántos usuarios hagan polling: las
//     llamadas reales a football-data.org se mantienen muy por debajo del límite.
//   • Consolida los marcadores usando KV: si la API deja de mandar un marcador
//     ya conocido, lo conserva hasta confirmarlo con FINISHED (igual que el build).
//   • Devuelve el MISMO formato que public/matches.json para que el cliente lo
//     consuma sin cambios.

const BASE = "https://api.football-data.org/v4";
const COMPETITION = "WC";
const LIVE_STATUSES = new Set(["IN_PLAY", "PAUSED"]);

// Edge cache y frescura para el navegador (segundos).
const EDGE_TTL = 30;
const BROWSER_TTL = 20;

// Resultados forzados a mano (la API los dio y luego los borró). Se tratan como
// un FINISHED confirmado. Clave = id del partido en football-data.org.
const SCORE_OVERRIDES = {
  "537327": { homeGoals: 2, awayGoals: 0 }, // México 2 - 0 Sudáfrica
};

// football-data.org (inglés) → nombres en español de la app.
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS,
      ...extraHeaders,
    },
  });
}

// Combina la respuesta de la API con el estado guardado en KV, conservando
// marcadores conocidos frente a los `null` intermitentes de la API.
function consolidate(apiMatches, store) {
  const next = { ...store };
  const matches = (apiMatches ?? [])
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
    .map((m) => {
      const id = String(m.id);
      const override = SCORE_OVERRIDES[id];
      const known = store[id];

      const apiHome = override ? override.homeGoals : (m.score?.fullTime?.home ?? null);
      const apiAway = override ? override.awayGoals : (m.score?.fullTime?.away ?? null);
      const apiHasScore = apiHome !== null || apiAway !== null;

      const knownHome = known?.homeGoals ?? null;
      const knownAway = known?.awayGoals ?? null;
      const hadKnown = knownHome !== null || knownAway !== null;

      const confirmed =
        Boolean(override) ||
        (m.status === "FINISHED" && apiHasScore) ||
        Boolean(known?.confirmed);

      let homeGoals;
      let awayGoals;
      if (apiHasScore) {
        homeGoals = apiHome;
        awayGoals = apiAway;
      } else {
        homeGoals = hadKnown ? knownHome : null;
        awayGoals = hadKnown ? knownAway : null;
      }

      const hasScore = homeGoals !== null || awayGoals !== null;
      const played = confirmed;

      let status;
      if (confirmed) status = "FINISHED";
      else if (hasScore) status = LIVE_STATUSES.has(m.status) ? m.status : "IN_PLAY";
      else if (m.status === "TIMED" && known && LIVE_STATUSES.has(known.status)) status = known.status;
      else status = m.status;

      const penalties = m.score?.duration === "PENALTY_SHOOTOUT" || Boolean(known?.penalties);

      // Persistir en KV solo lo que aporta estado (marcador o confirmado).
      if (hasScore || confirmed) {
        next[id] = { homeGoals, awayGoals, confirmed, status, penalties };
      }

      return {
        id,
        utcDate: m.utcDate,
        status,
        confirmed,
        stage: m.stage,
        home: m.homeTeam?.name ? toName(m.homeTeam.name) : "Por determinar",
        away: m.awayTeam?.name ? toName(m.awayTeam.name) : "Por determinar",
        homeGoals,
        awayGoals,
        phase: stageToPhase(m.stage),
        penalties,
        played,
        matchday: m.matchday ?? null,
      };
    });

  return { matches, next };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }
    if (url.pathname !== "/matches") {
      return new Response("Not found", { status: 404, headers: CORS });
    }

    // Cache de edge con clave fija (ignora query, p. ej. anticaché del cliente).
    const cache = caches.default;
    const cacheKey = new Request(new URL("/matches", url.origin).toString(), { method: "GET" });
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    if (!env.FOOTBALL_DATA_KEY) {
      return json({ error: "missing API key" }, { "Cache-Control": "no-store" });
    }

    let apiData;
    try {
      const res = await fetch(`${BASE}/competitions/${COMPETITION}/matches`, {
        headers: { "X-Auth-Token": env.FOOTBALL_DATA_KEY },
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      apiData = await res.json();
    } catch {
      // Si la API falla, devolver lo último consolidado que haya en KV (si hay).
      const storeRaw = (await env.SCORES.get("store")) ?? "{}";
      return json(JSON.parse(storeRaw).__matches ?? [], { "Cache-Control": "no-store" });
    }

    const storeRaw = (await env.SCORES.get("store")) ?? "{}";
    const store = JSON.parse(storeRaw);
    const { matches, next } = consolidate(apiData.matches, store);

    // Guardar el estado consolidado + un snapshot para el modo degradado.
    next.__matches = matches;
    const nextRaw = JSON.stringify(next);
    if (nextRaw !== JSON.stringify(store)) {
      ctx.waitUntil(env.SCORES.put("store", nextRaw));
    }

    const response = json(matches, {
      "Cache-Control": `public, max-age=${BROWSER_TTL}`,
    });
    // Cachear en el edge una copia con TTL propio.
    const edgeCopy = new Response(JSON.stringify(matches), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...CORS,
        "Cache-Control": `public, max-age=${EDGE_TTL}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, edgeCopy));

    return response;
  },
};
