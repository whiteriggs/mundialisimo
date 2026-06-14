"use client";

import NavBar from "@/components/NavBar";
import { useCallback, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { groupCollection } from "@/lib/db";
import { getStoredUser, clearUser, getUsers } from "@/lib/auth";
import { teamName, teamCode } from "@/lib/teams";
import { buildTeamTotals, matchPoints, Match } from "@/lib/scoring";
import { fetchAllMatches, ApiAllMatch, isLiveStatus } from "@/lib/football-api";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { maybeAnnounceLeader } from "@/lib/chat";
import { buildStaticSchedule } from "@/lib/static-schedule";
import PointsHistoryChart, { ChartSeries } from "@/components/PointsHistoryChart";

type BetDoc = {
  user: string;
  favorites: string[];
  antiFavorites: string[];
  confirmed: boolean;
};

export default function ResultadosPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [allApiMatches, setAllApiMatches] = useState<ApiAllMatch[]>([]);
  const [manualMatches, setManualMatches] = useState<Match[]>([]);
  const [bets, setBets] = useState<BetDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [userList, setUserList] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [apiAll, manualSnap, betSnap, users] = await Promise.all([
        fetchAllMatches().catch((err) => {
          setApiError(err.message);
          return [] as ApiAllMatch[];
        }),
        getDocs(collection(db, "matches")),
        getDocs(groupCollection("bets")),
        getUsers(),
      ]);
      setUserList(users);

      setAllApiMatches(apiAll.length > 0 ? apiAll : buildStaticSchedule());
      // Incluye partidos en vivo (IN_PLAY/PAUSED) con su marcador parcial para
      // que la clasificación de la porra se mueva en directo.
      const scored: Match[] = apiAll
        .filter((m) => m.played || isLiveStatus(m.status))
        .map((m) => ({
          id: m.id,
          home: m.home,
          away: m.away,
          homeGoals: m.homeGoals ?? 0,
          awayGoals: m.awayGoals ?? 0,
          phase: m.phase,
          penalties: m.penalties,
          played: true,
        }));
      setMatches(scored);

      const manual: Match[] = manualSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Match, "id">),
      }));
      setManualMatches(manual);

      setBets(
        betSnap.docs.map((d) => {
          const raw = d.data() as Partial<Omit<BetDoc, "user">>;
          return {
            user: d.id,
            favorites: raw.favorites ?? [],
            antiFavorites: raw.antiFavorites ?? [],
            confirmed: raw.confirmed ?? false,
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { router.push("/login"); return; }
    setCurrentUser(user);
    loadData();
  }, [router, loadData]);

  // Hay partidos en directo → refrescar rápido (12s) para que todos los
  // dispositivos converjan; si no, ritmo normal (30s).
  const anyLive = allApiMatches.some((m) => isLiveStatus(m.status));
  useLiveRefresh(loadData, anyLive ? 12_000 : 30_000);

  const teamTotals = buildTeamTotals([...matches, ...manualMatches]);

  const rankings = userList.map((u) => {
    const uid = u.toLowerCase();
    const bet = bets.find((b) => b.user === uid);
    const favPts = bet?.confirmed
      ? (bet.favorites ?? []).reduce((s, id) => s + (teamTotals[teamName(id)] ?? 0), 0)
      : 0;
    const antiPts = bet?.confirmed
      ? (bet.antiFavorites ?? []).reduce((s, id) => s + (teamTotals[teamName(id)] ?? 0), 0)
      : 0;
    return { user: u, uid, total: favPts - antiPts, favPts, antiPts, confirmed: bet?.confirmed ?? false, bet };
  }).sort((a, b) => b.total - a.total);

  // Líder actual (confirmado y con puntos). Cuando cambia de nombre, se anuncia
  // en el chat una sola vez (la transacción dedup en chat.ts evita duplicados).
  const topLeaderName = rankings.find((r) => r.confirmed && r.total > 0)?.user ?? null;
  const topLeaderTotal = rankings.find((r) => r.confirmed && r.total > 0)?.total ?? 0;
  // Solo avisar del cambio de líder cuando NO hay partidos en directo, para no
  // marear con mensajes mientras la clasificación baila durante un partido.
  useEffect(() => {
    if (!topLeaderName || anyLive) return;
    maybeAnnounceLeader(topLeaderName, topLeaderTotal);
    // Solo al cambiar el NOMBRE del líder (y sin partidos en vivo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topLeaderName, anyLive]);

  const roundData = useMemo(() => {
    const liveIds = new Set(
      allApiMatches.filter((m) => isLiveStatus(m.status)).map((m) => m.id)
    );
    // Partidos jugados o en vivo como columnas (cronológico): API por fecha, luego manuales.
    const apiPlayed: Match[] = allApiMatches
      .filter((m) => m.played || liveIds.has(m.id))
      .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
      .map((m) => ({
        id: m.id, home: m.home, away: m.away,
        homeGoals: m.homeGoals ?? 0, awayGoals: m.awayGoals ?? 0,
        phase: m.phase, penalties: m.penalties, played: true,
      }));
    const columns = [...apiPlayed, ...manualMatches.filter((m) => m.played)];

    // Puntos de cada equipo en cada partido.
    const colPts = columns.map((m) => ({ match: m, pts: matchPoints(m) }));

    // Puntuación de cada participante en cada partido (no acumulada).
    const perMatch: Record<string, number[]> = {};
    for (const r of rankings) {
      perMatch[r.uid] = colPts.map(({ pts }) => {
        if (!r.bet?.confirmed) return NaN;
        const fav = (r.bet.favorites ?? []).reduce((s, id) => s + (pts[teamName(id)] ?? 0), 0);
        const anti = (r.bet.antiFavorites ?? []).reduce((s, id) => s + (pts[teamName(id)] ?? 0), 0);
        return fav - anti;
      });
    }
    return { columns, perMatch, liveIds };
  }, [allApiMatches, manualMatches, rankings]);

  // Movimiento de puestos respecto a ANTES del último partido (columna más
  // reciente). Positivo = subió, negativo = bajó. Solo entre confirmados.
  const movements = useMemo(() => {
    const cols = roundData.columns.length;
    const out: Record<string, number> = {};
    if (cols === 0) return out;
    const confirmed = rankings.filter((r) => r.confirmed);
    // Posición actual (ya vienen ordenados por total).
    const currentPos: Record<string, number> = {};
    confirmed.forEach((r, i) => { currentPos[r.uid] = i; });
    // Posición previa: total sin la última columna jugada.
    const prev = confirmed
      .map((r) => {
        const last = roundData.perMatch[r.uid]?.[cols - 1];
        const prevTotal = r.total - (Number.isNaN(last) ? 0 : (last ?? 0));
        return { uid: r.uid, prevTotal };
      })
      .sort((a, b) => b.prevTotal - a.prevTotal);
    prev.forEach((r, i) => { out[r.uid] = i - currentPos[r.uid]; });
    return out;
  }, [roundData, rankings]);

  // Histórico de puntos acumulados por participante (para la gráfica).
  const history = useMemo(() => {
    const labels = roundData.columns.map((m) => `${teamCode(m.home)}-${teamCode(m.away)}`);
    const series: ChartSeries[] = rankings
      .filter((r) => r.confirmed)
      .map((r) => {
        const per = roundData.perMatch[r.uid] ?? [];
        let acc = 0;
        const points = [0];
        for (let i = 0; i < roundData.columns.length; i++) {
          const v = per[i];
          acc += Number.isNaN(v) ? 0 : v;
          points.push(acc);
        }
        return { uid: r.uid, name: r.user, points };
      });
    return { labels, series };
  }, [roundData, rankings]);

  function handleLogout() {
    clearUser();
    router.push("/login");
  }

  const playedMatches = matches.filter((m) => m.played);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialisimo</h1>
          <span className="sub">Clasificación</span>
        </div>
        <NavBar user={currentUser} />
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">⚽</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Porra Mundial 2026</div>
            <h2 className="hero-name">Clasificación</h2>
            <p className="lead">
              {playedMatches.length === 0
                ? "La clasificación se actualizará automáticamente con cada partido."
                : "Puntuación total y desglose partido a partido."}
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="loading-screen"><p className="muted">Cargando…</p></div>
      ) : (
        <>
          {apiError && (
            <div className="results-section">
              <p className="api-notice">Los datos de partidos se cargarán automáticamente cuando empiece el Mundial (11 jun 2026).</p>
            </div>
          )}

          {/* Clasificación: total + desglose por partido */}
          <div className="results-section">
            <div className="standings-wrap">
              <table className="standings-table">
                <thead>
                  <tr>
                    <th className="st-rank">#</th>
                    <th className="st-name">Participante</th>
                    <th className="st-total">Total</th>
                    {roundData.columns.map((m) => (
                      <th key={m.id} className={`st-match${roundData.liveIds.has(m.id) ? " st-match-live" : ""}`}>
                        <span className="st-match-teams">{teamCode(m.home)}-{teamCode(m.away)}</span>
                        <span className="st-match-score">{m.homeGoals}–{m.awayGoals}{m.penalties ? "p" : ""}</span>
                        {roundData.liveIds.has(m.id) && <span className="st-live-tag">EN VIVO</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((r, i) => (
                    <tr
                      key={r.uid}
                      className={`${r.uid === currentUser?.toLowerCase() ? "row-me" : ""} ${!r.confirmed ? "row-pending" : ""}`}
                    >
                      <td className="st-rank">{r.confirmed ? i + 1 : "—"}</td>
                      <td className="st-name">
                        {r.user}
                        {r.uid === currentUser?.toLowerCase() ? <span className="me-badge"> (tú)</span> : ""}
                        {!r.confirmed ? <span className="pending-label"> · sin confirmar</span> : ""}
                        {r.confirmed && roundData.columns.length > 0 ? (
                          movements[r.uid] ? (
                            <span className={`st-move ${movements[r.uid] > 0 ? "st-move-up" : "st-move-down"}`}>
                              {movements[r.uid] > 0 ? "▲" : "▼"}{Math.abs(movements[r.uid])}
                            </span>
                          ) : (
                            <span className="st-move st-move-same">=</span>
                          )
                        ) : null}
                      </td>
                      <td className="st-total">{r.confirmed ? r.total : "—"}</td>
                      {roundData.columns.map((m, ci) => {
                        const pts = roundData.perMatch[r.uid]?.[ci];
                        return (
                          <td
                            key={m.id}
                            className={`st-match-cell${!r.confirmed || isNaN(pts) ? "" : pts > 0 ? " pts-pos" : pts < 0 ? " pts-neg" : ""}`}
                          >
                            {!r.confirmed || isNaN(pts) ? "—" : pts > 0 ? `+${pts}` : `${pts}`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {roundData.columns.length === 0 && (
              <p className="muted" style={{ marginTop: 12 }}>
                Aún no hay partidos jugados. El desglose por partido aparecerá aquí en cuanto empiece el Mundial.
              </p>
            )}
          </div>

          {/* Histórico de puntos (gráfica de evolución) */}
          {history.series.length > 0 && history.labels.length > 0 && (
            <div className="results-section">
              <h2 className="results-title">Evolución de puntos</h2>
              <PointsHistoryChart
                labels={history.labels}
                series={history.series}
                currentUid={currentUser?.toLowerCase()}
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}
