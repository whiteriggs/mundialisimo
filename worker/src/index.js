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
const EDGE_TTL = 15;
const BROWSER_TTL = 10;

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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

// ────────────────────────────────────────────────────────────────────────
// Web Push (notificaciones). Implementación autocontenida con Web Crypto:
//   • VAPID: JWT ES256 firmado con la clave privada (secret del Worker).
//   • Cifrado del payload: aes128gcm (RFC 8291 / RFC 8188).
// El navegador del emisor llama a POST /notify; el Worker hace fan-out a las
// suscripciones del grupo (leídas de Firestore por REST), excluyendo al emisor.
// ────────────────────────────────────────────────────────────────────────
const FS_BASE = "https://firestore.googleapis.com/v1/projects/mundialisimo/databases/(default)/documents";
const VAPID_SUBJECT = "mailto:mundialisimo@whiteriggs.dev";

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes) {
  let bin = "";
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concatBytes(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

async function hmacSha256(keyBytes, data) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}
async function hkdf(salt, ikm, info, length) {
  const prk = await hmacSha256(salt, ikm);
  const t = await hmacSha256(prk, concatBytes(info, new Uint8Array([1])));
  return t.slice(0, length);
}

// Firma un JWT VAPID (ES256) para el endpoint de push dado.
async function vapidAuth(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUBJECT,
  })));
  const signingInput = `${header}.${payload}`;

  const pub = b64urlToBytes(env.VAPID_PUBLIC_KEY);
  const jwk = {
    kty: "EC", crv: "P-256", ext: true,
    d: env.VAPID_PRIVATE_KEY,
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
  return { jwt, k: env.VAPID_PUBLIC_KEY };
}

// Cifra `payloadStr` para una suscripción (p256dh + auth) con aes128gcm.
async function encryptPayload(payloadStr, p256dhB64, authB64) {
  const uaPublic = b64urlToBytes(p256dhB64);
  const authSecret = b64urlToBytes(authB64);

  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey)); // 65 bytes
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || ua_public || as_public, 32)
  const keyInfo = concatBytes(new TextEncoder().encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

  const plaintext = new TextEncoder().encode(payloadStr);
  const record = concatBytes(plaintext, new Uint8Array([2])); // delimitador de último registro
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record));

  // Cabecera aes128gcm: salt(16) || rs(4) || idlen(1) || keyid(as_public, 65)
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  const idlen = new Uint8Array([asPublic.length]);
  return concatBytes(salt, rs, idlen, asPublic, ciphertext);
}

async function sendOnePush(sub, payloadStr, env) {
  const body = await encryptPayload(payloadStr, sub.p256dh, sub.auth);
  const { jwt, k } = await vapidAuth(sub.endpoint, env);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      TTL: "86400",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Authorization: `vapid t=${jwt}, k=${k}`,
    },
    body,
  });
  return res.status;
}

// Lee las suscripciones de un grupo desde Firestore (REST).
async function fetchSubs(group) {
  const res = await fetch(`${FS_BASE}/groups/${encodeURIComponent(group)}/pushSubs?pageSize=300`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.documents ?? []).map((doc) => {
    const id = doc.name.split("/").pop();
    const f = doc.fields ?? {};
    return {
      id,
      user: f.user?.stringValue ?? "",
      endpoint: f.endpoint?.stringValue ?? "",
      p256dh: f.p256dh?.stringValue ?? "",
      auth: f.auth?.stringValue ?? "",
    };
  }).filter((s) => s.endpoint && s.p256dh && s.auth);
}

async function deleteSub(group, id) {
  await fetch(`${FS_BASE}/groups/${encodeURIComponent(group)}/pushSubs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function handleNotify(request, env, ctx) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "bad json" }, { "Cache-Control": "no-store" });
  }
  const { group, title, body, url: clickUrl, tag, excludeUser } = payload ?? {};
  if (!group || !title) return json({ error: "missing group/title" }, { "Cache-Control": "no-store" });

  const subs = await fetchSubs(group);
  const exclude = (excludeUser ?? "").toLowerCase();
  const targets = subs.filter((s) => s.user.toLowerCase() !== exclude);
  const notifPayload = JSON.stringify({ title, body: body ?? "", url: clickUrl ?? "/", tag: tag ?? "mundialisimo" });

  let sent = 0;
  const cleanups = [];
  await Promise.all(targets.map(async (s) => {
    try {
      const code = await sendOnePush(s, notifPayload, env);
      if (code === 404 || code === 410) cleanups.push(deleteSub(group, s.id));
      else if (code >= 200 && code < 300) sent++;
    } catch { /* ignorar fallos individuales */ }
  }));
  if (cleanups.length) ctx.waitUntil(Promise.all(cleanups));
  return json({ ok: true, sent, total: targets.length }, { "Cache-Control": "no-store" });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: { ...CORS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" },
      });
    }
    if (url.pathname === "/notify" && request.method === "POST") {
      return handleNotify(request, env, ctx);
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
