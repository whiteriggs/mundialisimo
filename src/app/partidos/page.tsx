"use client";

import NavBar from "@/components/NavBar";
import Flag from "@/components/Flag";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearUser } from "@/lib/auth";
import { fetchAllMatches, ApiAllMatch, isLiveStatus } from "@/lib/football-api";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { buildStaticSchedule } from "@/lib/static-schedule";
import { GROUP_POOL, TEAM_NAMES } from "@/lib/teams";
import { tvChannelsFor } from "@/lib/tv-channels";

// Mapa equipo → letra de grupo, para etiquetar los partidos de la fase de grupos.
const TEAM_GROUP: Record<string, string> = {};
for (const [g, names] of Object.entries(GROUP_POOL)) {
  for (const n of names) TEAM_GROUP[n] = g;
}

// ── Helpers de fecha en hora española (Europe/Madrid) ──────────────────────
const TZ = "Europe/Madrid";

const dayKey = (utc: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utc)); // "2026-06-11"

const kickoffTime = (utc: string) =>
  new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(utc));

const chipParts = (utc: string) => {
  const parts = new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(utc));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    weekday: get("weekday").replace(".", ""),
    day: get("day"),
    month: get("month").replace(".", ""),
  };
};

const longDate = (utc: string) =>
  new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(utc));

function phaseLabel(stage: string, home: string): string {
  switch (stage) {
    case "GROUP_STAGE":
      return TEAM_GROUP[home] ? `Grupo ${TEAM_GROUP[home]}` : "Fase de grupos";
    case "LAST_32":
      return "Dieciseisavos";
    case "LAST_16":
      return "Octavos";
    case "QUARTER_FINALS":
      return "Cuartos";
    case "SEMI_FINALS":
      return "Semifinal";
    case "THIRD_PLACE":
      return "3.º y 4.º puesto";
    case "FINAL":
      return "Final";
    default:
      return "";
  }
}

// ── Filtros por fase ────────────────────────────────────────────────────────
const PHASE_FILTERS: { key: string; label: string; stages: string[] }[] = [
  { key: "all", label: "Todas", stages: [] },
  { key: "groups", label: "Grupos", stages: ["GROUP_STAGE"] },
  { key: "r32", label: "Dieciseisavos", stages: ["LAST_32"] },
  { key: "r16", label: "Octavos", stages: ["LAST_16"] },
  { key: "qf", label: "Cuartos", stages: ["QUARTER_FINALS"] },
  { key: "sf", label: "Semis", stages: ["SEMI_FINALS"] },
  { key: "final", label: "Final", stages: ["THIRD_PLACE", "FINAL"] },
];

function MatchCard({ m }: { m: ApiAllMatch }) {
  const tag = phaseLabel(m.stage, m.home);
  const channels = tvChannelsFor(m);
  const live = isLiveStatus(m.status);
  return (
    <article className="pm-card" data-played={m.played} data-live={live}>
      <div className="pm-main">
        <span className="pm-tag">{tag}{live && <span className="pm-live">EN VIVO</span>}</span>
        <div className="pm-fixture">
          <div className="pm-team pm-team--home">
            <span className="pm-team-name">{m.home}</span>
            <Flag name={m.home} />
          </div>
          <div className="pm-center">
            {(m.played || live) ? (
              <span className="pm-score">
                {m.homeGoals}<span className="pm-dash">–</span>{m.awayGoals}
              </span>
            ) : (
              <span className="pm-vs">vs</span>
            )}
          </div>
          <div className="pm-team pm-team--away">
            <Flag name={m.away} />
            <span className="pm-team-name">{m.away}</span>
          </div>
        </div>
        {m.played && m.penalties && <div className="pm-pens">Decidido en penaltis</div>}
      </div>
      <div className="pm-meta">
        <span className="pm-kick">{kickoffTime(m.utcDate)}</span>
        <div className="pm-tv">
          {channels.map((ch) => (
            <a
              key={ch.name}
              className={`tv-chip tv-${ch.kind}`}
              href={ch.url}
              target="_blank"
              rel="noopener noreferrer"
              title={`${ch.name} · ${ch.kind === "gratis" ? "Gratis" : "De pago"}`}
            >
              {ch.name}
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function PartidosPage() {
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [matches, setMatches] = useState<ApiAllMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"calendario" | "equipos">("calendario");
  const [phaseKey, setPhaseKey] = useState("all");
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const dayStripRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(() => {
    return fetchAllMatches()
      .then((data) => setMatches(data.length > 0 ? data : buildStaticSchedule()))
      .catch(() => setMatches(buildStaticSchedule()));
  }, []);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.push("/login"); return; }
    setUser(u);
    loadData().finally(() => setLoading(false));
  }, [router, loadData]);

  useLiveRefresh(loadData);

  const activeStages = useMemo(
    () => PHASE_FILTERS.find((p) => p.key === phaseKey)?.stages ?? [],
    [phaseKey]
  );

  // Partidos filtrados por fase y ordenados cronológicamente.
  const filtered = useMemo(() => {
    const list = activeStages.length
      ? matches.filter((m) => activeStages.includes(m.stage))
      : matches;
    return [...list].sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  }, [matches, activeStages]);

  // Días únicos (hora española) presentes en los partidos filtrados.
  const days = useMemo(() => {
    const seen = new Map<string, string>(); // key → primer utcDate de ese día
    for (const m of filtered) {
      const k = dayKey(m.utcDate);
      if (!seen.has(k)) seen.set(k, m.utcDate);
    }
    return [...seen.entries()].map(([key, utc]) => ({ key, utc }));
  }, [filtered]);

  // Día por defecto: el del próximo partido sin jugar; si no, el primero.
  useEffect(() => {
    if (days.length === 0) return;
    if (days.some((d) => d.key === selectedDay)) return;
    const nextUnplayed = filtered.find((m) => !m.played);
    const target = nextUnplayed ? dayKey(nextUnplayed.utcDate) : days[0].key;
    setSelectedDay(days.some((d) => d.key === target) ? target : days[0].key);
  }, [days, filtered, selectedDay]);

  // Centrar el chip del día activo en la tira horizontal.
  useEffect(() => {
    const strip = dayStripRef.current;
    if (!strip || !selectedDay) return;
    const el = strip.querySelector<HTMLElement>(`[data-day="${selectedDay}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedDay]);

  const dayMatches = useMemo(
    () => filtered.filter((m) => dayKey(m.utcDate) === selectedDay),
    [filtered, selectedDay]
  );

  // Partidos de la selección elegida (pestaña Equipos), agrupados por día.
  const teamGroups = useMemo(() => {
    if (!selectedTeam) return [];
    const list = matches
      .filter((m) => m.home === selectedTeam || m.away === selectedTeam)
      .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    const groups: { day: string; utc: string; matches: ApiAllMatch[] }[] = [];
    for (const m of list) {
      const k = dayKey(m.utcDate);
      const last = groups[groups.length - 1];
      if (last && last.day === k) last.matches.push(m);
      else groups.push({ day: k, utc: m.utcDate, matches: [m] });
    }
    return groups;
  }, [matches, selectedTeam]);

  function handleLogout() {
    clearUser();
    router.push("/login");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialisimo</h1>
          <span className="sub">Partidos</span>
        </div>
        <NavBar user={user} />
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">📅</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Mundial 2026 · Calendario</div>
            <h2 className="hero-name">Partidos</h2>
            <p className="lead">
              Todos los partidos con horario en hora española. Filtra por fase y por día.
            </p>
          </div>
        </div>
      </section>

      <div className="pm-wrap">
        {loading ? (
          <p className="muted" style={{ textAlign: "center" }}>Cargando…</p>
        ) : (
          <>
            {/* Pestañas: Calendario / Equipos */}
            <div className="pm-tabs" role="tablist" aria-label="Vista">
              <button
                type="button"
                role="tab"
                className={`pm-tab${view === "calendario" ? " is-active" : ""}`}
                aria-selected={view === "calendario"}
                onClick={() => setView("calendario")}
              >
                Calendario
              </button>
              <button
                type="button"
                role="tab"
                className={`pm-tab${view === "equipos" ? " is-active" : ""}`}
                aria-selected={view === "equipos"}
                onClick={() => setView("equipos")}
              >
                Equipos
              </button>
            </div>

            {view === "calendario" ? (
              <>
                {/* Filtro por fase */}
                <div className="pm-filters" role="tablist" aria-label="Filtrar por fase">
                  {PHASE_FILTERS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      className={`pm-chip${phaseKey === p.key ? " is-active" : ""}`}
                      aria-pressed={phaseKey === p.key}
                      onClick={() => setPhaseKey(p.key)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Tira de días */}
                <div className="pm-days" ref={dayStripRef} role="tablist" aria-label="Filtrar por día">
                  {days.map(({ key, utc }) => {
                    const { weekday, day, month } = chipParts(utc);
                    const active = key === selectedDay;
                    return (
                      <button
                        key={key}
                        type="button"
                        data-day={key}
                        className={`pm-day${active ? " is-active" : ""}`}
                        aria-pressed={active}
                        onClick={() => setSelectedDay(key)}
                      >
                        <span className="pm-day-wd">{weekday}</span>
                        <span className="pm-day-num">{day}</span>
                        <span className="pm-day-mo">{month}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Partidos del día seleccionado */}
                {dayMatches.length > 0 && (
                  <h3 className="pm-dayhead">{longDate(dayMatches[0].utcDate)}</h3>
                )}
                <div className="pm-list">
                  {dayMatches.map((m) => (
                    <MatchCard key={m.id} m={m} />
                  ))}
                  {dayMatches.length === 0 && (
                    <p className="muted" style={{ textAlign: "center" }}>
                      No hay partidos para este filtro.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Selector de selección */}
                <div className="pm-teams" role="listbox" aria-label="Elige una selección">
                  {TEAM_NAMES.map((name) => (
                    <button
                      key={name}
                      type="button"
                      role="option"
                      aria-selected={selectedTeam === name}
                      className={`pm-team-chip${selectedTeam === name ? " is-active" : ""}`}
                      onClick={() => setSelectedTeam((t) => (t === name ? null : name))}
                    >
                      <Flag name={name} />
                      <span>{name}</span>
                    </button>
                  ))}
                </div>

                {/* Partidos de la selección elegida */}
                {selectedTeam ? (
                  teamGroups.length > 0 ? (
                    teamGroups.map((g) => (
                      <div key={g.day}>
                        <h3 className="pm-dayhead">{longDate(g.utc)}</h3>
                        <div className="pm-list">
                          {g.matches.map((m) => (
                            <MatchCard key={m.id} m={m} />
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="muted" style={{ textAlign: "center" }}>
                      No hay partidos para {selectedTeam}.
                    </p>
                  )
                ) : (
                  <p className="muted" style={{ textAlign: "center" }}>
                    Elige una selección para ver sus partidos.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
