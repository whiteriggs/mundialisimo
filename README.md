# Mundialísimo ⚽

Una **porra del Mundial 2026** para jugar entre amigos: cada participante elige unas selecciones **favoritas** y otras **antifavoritas**, y va sumando (o restando) puntos según cómo les vaya en el torneo. La web muestra la clasificación en directo, el cuadro de eliminatorias, simuladores, probabilidades, una crónica generada por IA y un palmarés de estadísticas absurdas.

Es una **web estática** (Next.js exportado a GitHub Pages) que se apoya en un **Cloudflare Worker** para los datos en vivo y en **Firestore** para las apuestas, el chat y las crónicas. No tiene servidor propio.

---

## 🎮 Cómo se juega

Cada participante confecciona su **apuesta** (un "ticket") con:

- **Favoritos**: entre 9 y 12 selecciones. Sus puntos te **suman**.
- **Antifavoritos**: entre 4 y 6 selecciones. Sus puntos te **restan**.
- Hay un **presupuesto** (las selecciones más fuertes "cuestan" más), así que no puedes ponerlas todas de favoritas.

Tu puntuación total = **puntos de tus favoritos − puntos de tus antifavoritos**.

### Cómo puntúa cada selección (por partido)

| Fase | Por gol | Empate | Victoria | Bonus |
|------|:------:|:------:|:--------:|-------|
| Grupos | +1 | +5 | +10 | — |
| 3.º y 4.º puesto | +1 | +5 | +10 | — |
| Eliminatorias | +1 | +5 | +10 | **+5 por jugar** (cada ronda) |

- En **eliminatorias**, además de goles y resultado, cada equipo recibe **+5 solo por jugar** el partido. Por eso un antifavorito fuerte que llega lejos hace mucho daño.
- **Penaltis**: cuentan como **empate** (+5 a cada equipo). Solo cuentan los goles del **juego** (prórroga incluida), **no los de la tanda**. La tanda solo decide quién avanza en el cuadro.

La lógica vive en [`src/lib/scoring.ts`](src/lib/scoring.ts).

---

## 🧭 Funcionalidades (pestañas)

| Pestaña | Ruta | Qué hace |
|---------|------|----------|
| **Calendario** | `/partidos` | Todos los partidos por día, con horario **en hora local** del usuario y dónde verlos por TV. |
| **Clasificación** | `/resultados` | Ranking de la porra + desglose partido a partido (columnas de más reciente a más antigua) y gráfica de evolución. Se mueve en directo. |
| **Apuestas** | `/apuesta` | Construye tu ticket de favoritos/antifavoritos respetando el presupuesto. |
| **Grupos/Resultados** | `/grupos` | Clasificación FIFA de los 12 grupos, mejores terceros y resultados. |
| **Eliminatorias** | `/eliminatorias` | Cuadro oficial M73–M104. Coloca cada cruce real (terceros incluidos), propaga ganadores ronda a ronda y resuelve penaltis. |
| **Qué pasaría si…** | `/que-pasaria-si` | Simulador personal: pon los resultados que tú quieras en los partidos por jugar y mira cómo quedaría tu porra. Los partidos ya jugados salen fijos. |
| **Probabilidades** | `/probabilidades` | Monte Carlo (~5.000 simulaciones) del resto del torneo: % de ganar la porra, podio, farolillo, puntos esperados, cara a cara, MVP/lastre y prob. de campeón por selección. |
| **Estadísticas** | `/estadisticas` | Palmarés de coña: El Pelotazo, El Hostión, Rey del Mambo, Farolillo de Honor, Ave Fénix, El Titanic… |
| **Crónica** | `/cronica` | Crónica de la jornada con estética de periódico, generada por IA (Gemini). |
| **Reglas** | `/reglas` | Las normas de la porra. |
| **Admin** | `/admin` | Gestión de usuarios, contraseñas, apuestas y generación/publicación de crónicas. |

Extras: **chat** del grupo en tiempo real, **notificaciones push** (PWA), **cuenta atrás** del próximo partido (o marcador en vivo si hay varios a la vez), y widget del **campeón UFWC**.

---

## 🏗️ Arquitectura y flujo de datos

```
            ┌──────────────────────────┐
            │  football-data.org (API)  │  ← resultados oficiales
            └────────────┬─────────────┘
                         │ (key como secret)
                 ┌───────▼────────┐
                 │ Cloudflare      │  proxy con CORS + caché ~15s + KV.
                 │ Worker          │  Consolida marcadores, deduce ganador
                 │ (worker/)       │  de penaltis, expone JSON al navegador.
                 └───────┬────────┘
                         │
   Web estática ◄────────┤  Orden de fuentes de partidos:
   (GitHub Pages)        │   0. Worker en vivo (preferente)
                         │   1. public/matches.json (horneado en el build)
                         │   2. API directa (último recurso)
                         │
                 ┌───────▼────────┐
                 │  Firestore      │  apuestas, usuarios, chat, crónicas,
                 │  (REST + SDK)   │  simulaciones y subs de push (por grupo).
                 └────────────────┘
```

- **Datos en vivo**: el [Worker de Cloudflare](worker/src/index.js) llama a football-data.org (la API key nunca llega al cliente), cachea en el edge, **conserva marcadores** ante respuestas intermitentes (KV), y normaliza/expone el JSON con CORS. También **deduce el ganador de una tanda de penaltis** a partir del `fullTime` cuando la API no lo da.
- **Respaldo estático**: en cada build, [`scripts/fetch-matches.mjs`](scripts/fetch-matches.mjs) descarga los partidos y los hornea en `public/matches.json`. Un **cron cada 5 min** (durante el Mundial) reconstruye la web para mantener ese respaldo fresco, ya que el sitio es estático.
- **Datos del grupo** (apuestas, chat, crónicas, simulaciones): **Firestore**, leído por REST a través del Worker (cacheado, para no agotar la cuota) con el SDK como apoyo. Todo está **segmentado por grupo** (`getGroupId()`), así que la misma web sirve para varias porras.

---

## 📁 Estructura del proyecto

```
src/
  app/                 # App Router (una carpeta por ruta de la tabla de arriba)
  components/          # NavBar, ChatWidget, NextMatchCountdown, Flag, NewspaperChronicle…
  lib/
    scoring.ts         # Reglas de puntuación de la porra
    teams.ts           # 48 selecciones, grupos, precios, semillas FIFA, códigos/banderas
    standings.ts       # Clasificación FIFA de grupos (con desempates)
    football-api.ts    # Fuente de partidos (Worker → estático → API) + KO + penaltis
    realBracket.ts     # Resuelve el cuadro REAL (ancla en R32 + propagación de ganadores)
    simulateBracket.ts # Motor del cuadro para el simulador "qué pasaría si"
    winProbability.ts  # Monte Carlo de probabilidades de la porra
    strength.ts        # Fuerza de cada selección (Elo base + ajuste por resultados)
    stats.ts           # Premios de la pestaña Estadísticas
    knockout.ts        # Resolutor de huecos del cuadro por clasificación
    leaderboard.ts     # Clasificación de la porra (lecturas REST)
    predictions.ts     # Simulaciones personales del usuario (Firestore)
    chronicle.ts / chronicles.ts / gemini.ts   # Crónicas IA
    chat.ts / push.ts  # Chat y notificaciones push
    group.ts / db.ts / fsread.ts / auth.ts      # Grupo activo, acceso a datos, login
worker/src/index.js    # Cloudflare Worker (proxy en vivo + Web Push)
scripts/fetch-matches.mjs   # Genera public/matches.json en el build
.github/workflows/deploy-pages.yml   # Build + deploy a GitHub Pages (+ cron)
```

---

## 🧱 Stack

- **Next.js 16** (App Router, exportación estática) + **React 19** + **TypeScript**
- **Firebase / Firestore** para datos del grupo
- **Cloudflare Workers** (+ KV) para datos en vivo y Web Push
- **Google Gemini** para las crónicas, **football-data.org** para los resultados
- Despliegue en **GitHub Pages** vía GitHub Actions

---

## 💻 Desarrollo local

Requisitos: **Node.js 22+** y **npm 10+**.

```bash
npm install
npm run dev          # http://localhost:3000
```

Otros scripts:

- `npm run build` — build de producción (también ejecuta `prebuild` → genera `matches.json`)
- `npm run build:pages` — genera `matches.json` y compila para Pages
- `npm run start` — sirve el build de Next
- `npm run serve:out` — sirve la exportación estática (`out/`)
- `npm run lint` — ESLint

### Variables de entorno (`.env.local`)

```ini
NEXT_PUBLIC_FOOTBALL_DATA_KEY=...      # API key de football-data.org
NEXT_PUBLIC_LIVE_MATCHES_URL=https://<tu-worker>.workers.dev/matches
NEXT_PUBLIC_GEMINI_API_KEY=...         # crónicas IA
NEXT_PUBLIC_GNEWS_API_KEY=...          # opcional (noticias)
# NEXT_PUBLIC_BASE_PATH / NEXT_PUBLIC_BUILD_RUN los inyecta el CI
```

> El config de Firebase está en `src/lib/firebase.ts`. La API key de football-data **solo** se usa como secret en el Worker y en el build; el navegador consume el Worker.

---

## 🚀 Despliegue

Automático en **GitHub Pages** desde `main` con [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml):

1. `npm ci` → `npm run build:pages` (descarga partidos + exporta estático a `out/`).
2. Sube el artefacto y despliega a Pages.

Se dispara en cada **push a `main`**, manualmente, y por un **cron cada 5 min** (ventana del Mundial) para refrescar el `matches.json` horneado. Secrets/vars del repo: `FOOTBALL_DATA_KEY`, `NEXT_PUBLIC_GEMINI_API_KEY`, `NEXT_PUBLIC_GNEWS_API_KEY`, `LIVE_MATCHES_URL`.

### Cloudflare Worker

```bash
cd worker
npx wrangler deploy
```

La API key va como **secret** (`wrangler secret put FOOTBALL_DATA_KEY`) y usa un **KV namespace** (`SCORES`) para conservar los marcadores. La clave pública VAPID para Web Push está en `wrangler.toml`; la privada es otro secret.
