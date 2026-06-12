"use client";

import NavBar from "@/components/NavBar";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { generateText } from "@/lib/gemini";
import { fetchAllMatches } from "@/lib/football-api";
import { Match, buildTeamTotals, calcUserScore } from "@/lib/scoring";
import { db } from "@/lib/firebase";
import { groupDoc } from "@/lib/db";
import { getGroupConfig, isGroupAdmin } from "@/lib/group";
import {
  getStoredUser,
  clearUser,
  getUsers,
  addUser,
  removeUser,
  deleteUserPassword,
} from "@/lib/auth";
import { TEAMS, GROUP_POOL } from "@/lib/teams";

// ─── Bet logic (same as /apuesta) ───────────────────────────────
const favoriteBounds  = { min: 9, max: 12 };
const antiBounds      = { min: 4, max: 6 };
const ticketBounds    = { min: 15, max: 22 };
const groupLabels     = Object.keys(GROUP_POOL);

function hasDuplicateGroup(ids: string[]) {
  const groups = ids
    .map((id) => TEAMS.find((t) => t.id === id)?.group)
    .filter(Boolean) as string[];
  return new Set(groups).size !== groups.length;
}

type Tab = "usuarios" | "contrasenas" | "apuestas" | "cronica";

export default function AdminPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("usuarios");

  // ── Usuarios state ────────────────────────────────────────────
  const [userList, setUserList]       = useState<string[]>([]);
  const [newUser, setNewUser]         = useState("");
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersMsg, setUsersMsg]       = useState<string | null>(null);

  // ── Contraseñas state ─────────────────────────────────────────
  const [pwUser, setPwUser]           = useState("");
  const [pwMsg, setPwMsg]             = useState<string | null>(null);
  const [pwBusy, setPwBusy]           = useState(false);

  // ── Apuestas state ────────────────────────────────────────────
  const [betUser, setBetUser]         = useState("");
  const [favorites, setFavorites]     = useState<string[]>([]);
  const [antiFavorites, setAntiFavorites] = useState<string[]>([]);
  const [superFavorite, setSuperFavorite] = useState<string | null>(null);
  const [confirmed, setConfirmed]     = useState(false);
  const [betLoading, setBetLoading]   = useState(false);
  const [betSaving, setBetSaving]     = useState(false);
  const [betMsg, setBetMsg]           = useState<string | null>(null);
  const [betLoaded, setBetLoaded]     = useState(false);

  // ── Crónica IA state ──────────────────────────────────────────
  const [chronicleGenerating, setChronicleGenerating] = useState(false);
  const [chronicleMsg, setChronicleMsg]               = useState<string | null>(null);
  const [chronicleContext, setChronicleContext]        = useState("");
  const [chroniclePreview, setChroniclePreview]        = useState<string | null>(null);
  const [chroniclePublishing, setChroniclePublishing]  = useState(false);

  // ── Auth guard ────────────────────────────────────────────────
  useEffect(() => {
    const user = getStoredUser();
    if (!user) { router.push("/login"); return; }
    if (!isGroupAdmin(user)) { router.push("/apuesta"); return; }
    setCurrentUser(user);
    loadUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ── Helpers ───────────────────────────────────────────────────
  async function loadUsers() {
    setUsersLoading(true);
    try {
      setUserList(await getUsers());
    } finally {
      setUsersLoading(false);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    const name = newUser.trim();
    if (!name) return;
    try {
      await addUser(name);
      setNewUser("");
      setUsersMsg(`${name} añadido.`);
      await loadUsers();
    } catch {
      setUsersMsg("Error al añadir.");
    }
    setTimeout(() => setUsersMsg(null), 3000);
  }

  async function handleRemoveUser(username: string) {
    if (!confirm(`¿Eliminar a ${username} de la lista de usuarios?`)) return;
    try {
      await removeUser(username);
      setUsersMsg(`${username} eliminado.`);
      await loadUsers();
    } catch {
      setUsersMsg("Error al eliminar.");
    }
    setTimeout(() => setUsersMsg(null), 3000);
  }

  async function handleResetPassword() {
    if (!pwUser) return;
    if (!confirm(`¿Resetear la contraseña de ${pwUser}? Tendrá que crear una nueva al entrar.`)) return;
    setPwBusy(true);
    setPwMsg(null);
    try {
      await deleteUserPassword(pwUser);
      setPwMsg(`Contraseña de ${pwUser} eliminada.`);
    } catch {
      setPwMsg("Error al resetear.");
    } finally {
      setPwBusy(false);
    }
    setTimeout(() => setPwMsg(null), 4000);
  }

  async function handleLoadBet() {
    if (!betUser) return;
    setBetLoading(true);
    setBetMsg(null);
    setBetLoaded(false);
    try {
      const snap = await getDoc(groupDoc("bets", betUser.toLowerCase()));
      if (snap.exists()) {
        const data = snap.data();
        setFavorites(data.favorites ?? []);
        setAntiFavorites(data.antiFavorites ?? []);
        setSuperFavorite(data.superFavorite ?? null);
        setConfirmed(data.confirmed ?? false);
      } else {
        setFavorites([]);
        setAntiFavorites([]);
        setSuperFavorite(null);
        setConfirmed(false);
      }
      setBetLoaded(true);
    } catch {
      setBetMsg("Error al cargar la apuesta.");
    } finally {
      setBetLoading(false);
    }
  }

  async function handleSaveBet() {
    if (!betUser || !allValidBet) return;
    setBetSaving(true);
    setBetMsg(null);
    try {
      await setDoc(groupDoc("bets", betUser.toLowerCase()), {
        favorites,
        antiFavorites,
        superFavorite: superFavorite ?? null,
        confirmed: true,
        updatedAt: new Date(),
      });
      setConfirmed(true);
      setBetMsg(`Apuesta de ${betUser} guardada y confirmada.`);
    } catch {
      setBetMsg("Error al guardar.");
    } finally {
      setBetSaving(false);
    }
    setTimeout(() => setBetMsg(null), 4000);
  }

  async function handleResetBet() {
    if (!betUser) return;
    if (!confirm(`¿Resetear la apuesta de ${betUser}? Se guardará vacía.`)) return;
    setBetSaving(true);
    setBetMsg(null);
    try {
      await setDoc(groupDoc("bets", betUser.toLowerCase()), {
        favorites: [],
        antiFavorites: [],
        superFavorite: null,
        confirmed: false,
        updatedAt: new Date(),
      });
      setFavorites([]);
      setAntiFavorites([]);
      setSuperFavorite(null);
      setConfirmed(false);
      setBetMsg(`Apuesta de ${betUser} reseteada.`);
    } catch {
      setBetMsg("Error al resetear.");
      setBetSaving(false);
    }
    setTimeout(() => setBetMsg(null), 4000);
  }

  function buildChroniclePrompt(
    allBets: Record<string, { favorites: string[]; antiFavorites: string[]; superFavorite: string | null }>,
    jornadaMatches: Match[],
    leaderboard: { uname: string; score: number }[],
    extraContext = ""
  ): string {
    const teamInfo = Object.entries(GROUP_POOL)
      .map(([g, names]) => `  Grupo ${g}: ${names.map((n, i) => `${n}(${["★★★★","★★★","★★","★"][i]})`).join(", ")}`)
      .join("\n");
    const betsInfo = Object.entries(allBets).map(([uname, data]) => {
      const sfTeam  = data.superFavorite ? TEAMS.find(t => t.id === data.superFavorite) : null;
      const favNames  = data.favorites.map(id => TEAMS.find(t => t.id === id)?.name ?? id).join(", ");
      const antiNames = data.antiFavorites.map(id => TEAMS.find(t => t.id === id)?.name ?? id).join(", ");
      return `${uname}:\n  Favoritos: ${favNames || "ninguno"}\n  Antifavoritos: ${antiNames || "ninguno"}\n  Superfavorito: ${sfTeam ? sfTeam.name : "ninguno"}`;
    }).join("\n\n");
    const matchesInfo = jornadaMatches.length === 0
      ? "No se han jugado partidos en esta jornada."
      : jornadaMatches.map(m =>
          `${m.home} ${m.homeGoals}-${m.awayGoals} ${m.away}${m.penalties ? " (pen.)" : ""}`
        ).join("\n");
    // Build team → participants lookup
    const teamOwners: Record<string, { favs: string[]; antis: string[] }> = {};
    Object.entries(allBets).forEach(([uname, data]) => {
      data.favorites.forEach(id => {
        const name = TEAMS.find(t => t.id === id)?.name ?? id;
        if (!teamOwners[name]) teamOwners[name] = { favs: [], antis: [] };
        teamOwners[name].favs.push(uname);
      });
      data.antiFavorites.forEach(id => {
        const name = TEAMS.find(t => t.id === id)?.name ?? id;
        if (!teamOwners[name]) teamOwners[name] = { favs: [], antis: [] };
        teamOwners[name].antis.push(uname);
      });
    });
    const teamOwnersInfo = Object.entries(teamOwners)
      .map(([team, o]) => {
        const parts = [];
        if (o.favs.length) parts.push(`favorito de: ${o.favs.join(", ")}`);
        if (o.antis.length) parts.push(`antifavorito de: ${o.antis.join(", ")}`);
        return `  ${team} → ${parts.join(" | ")}`;
      }).join("\n");
    const leaderboardInfo = leaderboard.length === 0
      ? "Sin partidos jugados aún, todos a 0 puntos."
      : leaderboard.map((e, i) => `  ${i + 1}. ${e.uname}: ${e.score} pts`).join("\n");
    return `Eres «LaIA», la reportera estrella —y muy sarcástica— de la Porra del Mundial 2026. Escribes en primera persona, con mala leche cariñosa, ingenio y emojis. Tu crónica cubre los partidos de las ÚLTIMAS 24 HORAS: SOLO comentas los partidos FINALIZADOS que aparecen en "PARTIDOS DE LA JORNADA". No inventes resultados ni menciones partidos que no estén en esa lista.

PARTICIPANTES Y SUS MANÍAS (úsalas como guía sutil de tono; NO las cites literalmente, NO las uses todas ni las repitas, solo cuando venga a cuento y con naturalidad):\n- Esteban: siempre llega tarde a todo.\n- Jorge: dice que trabaja de noche y se escapa de vacaciones al pueblo cada dos por tres.\n- Juan: promete que viene y siempre nos deja tirados.\n- Manuel: presume de viajar y de estar ocupadísimo, pero es un Willy Fog que no para quieto sin hacer gran cosa.\n- Jordi: madruga para salir con la bici a las 5 de la mañana.\n- Javi: el de los gadgets, siempre con su perro Riggs.\n- Capde: corre, va en bici y trabaja muchísimo.\n- Iris: profesora y ahora directora del cole.\n- Ester: de Zarza, melena corta, jugaba al basket.\n- JuanRa: curra sin parar, aparece de vez en cuando, hijos ya mayores.\n- Sebas: argentino y algo despistado.\n- Adri y Mariona: deportistas (basket y fútbol). Con ellos SÉ SUAVE: bromas cariñosas, nada de sarcasmo duro. NO menciones su edad ni que son pequeños.

TONO: sarcástico, gamberro y divertido, pero sin crueldad real y SIN palabrotas.

REGLAS DE LA PORRA (para no confundir conceptos):\n- Cada participante elige equipos FAVORITOS y ANTIFAVORITOS.\n- Cada equipo tiene un VALOR DE APUESTA (1 a 4): es solo el coste de incluirlo, NO son puntos de torneo. 4 = gran favorito del grupo, 1 = farolillo rojo.\n- Acertar = que tus FAVORITOS ganen y tus ANTIFAVORITOS pierdan. Lo más ridículo es apostar un favorito fuerte que pierde, o poner de antifavorito a un equipo que acaba ganando.

EQUIPOS DEL MUNDIAL 2026 (por grupo):\n${teamInfo}\n\nQUIÉN TIENE CADA EQUIPO (favorito / antifavorito de quién):\n${teamOwnersInfo}\n\nAPUESTAS DE CADA UNO (referencia):\n${betsInfo}\n\nCLASIFICACIÓN ACTUAL DE LA PORRA:\n${leaderboardInfo}\n\nPARTIDOS DE LA JORNADA (finalizados en las últimas 24h, a comentar):\n${matchesInfo}\n\nDEVUELVE EXACTAMENTE ESTE FORMATO DE TEXTO (sin markdown, sin asteriscos, sin texto extra antes o después). Respeta las etiquetas en MAYÚSCULAS al inicio de línea:

TITULAR: [un titular de portada sensacionalista y gracioso, estilo diario deportivo, sobre lo más jugoso de la jornada. Máx. 12 palabras]
ENTRADILLA: [una sola frase de subtítulo, irónica, que resuma la jornada]
CRONICA:
[1 o 2 párrafos cortos (2-4 frases en total) comentando con sarcasmo los partidos finalizados de la lista. Tono de columnista gamberro.]
RANKING:
[Una línea por participante, en el ORDEN de la clasificación actual, con este formato EXACTO:
posición | Nombre | comentario sarcástico breve
Para cada uno cruza SUS apuestas con los RESULTADOS DE LA JORNADA: cébate (con gracia) con quien tenga un FAVORITO que ha perdido o un ANTIFAVORITO que ha ganado en esta jornada; a quien le fue bien, reconócelo a regañadientes. Trato SUAVE con Adri y Mariona. Un comentario por persona, sin saltarte a nadie.]

Reglas de formato: usa emojis con moderación dentro de los textos; NO uses la barra vertical "|" salvo como separador del ranking; NO añadas ninguna sección, cabecera ni despedida fuera de las etiquetas indicadas.${extraContext ? `\n\nCONTEXTO ADICIONAL (tenlo en cuenta al escribir la crónica):\n${extraContext}` : ""}`;
  }

  async function handleGenerateChronicle() {
    if (!confirm("Generar nueva crónica con IA. Puede tardar 10-20 segundos.")) return;
    setChronicleGenerating(true);
    setChronicleMsg(null);
    try {
      const users = await getUsers();
      const allBets: Record<string, { favorites: string[]; antiFavorites: string[]; superFavorite: string | null }> = {};
      for (const u of users) {
        const snap = await getDoc(groupDoc("bets", u.toLowerCase()));
        if (!snap.exists()) continue;
        const data = snap.data() as { favorites?: string[]; antiFavorites?: string[]; superFavorite?: string | null };
        allBets[u] = { favorites: data.favorites ?? [], antiFavorites: data.antiFavorites ?? [], superFavorite: data.superFavorite ?? null };
      }

      // Jornada = partidos finalizados cuyo inicio (utcDate) cae dentro de las
      // últimas 24h. Cada partido trae su hora de inicio, así que comparamos con
      // (ahora − 24h). Los manuales del admin se incluyen siempre (curados).
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const playedMatches: Match[] = [];
      const apiPlayed: { match: Match; start: number }[] = [];
      try {
        const apiMatches = await fetchAllMatches();
        apiMatches.filter(m => m.played).forEach(m => {
          const match: Match = { id: m.id, home: m.home, away: m.away, homeGoals: m.homeGoals ?? 0, awayGoals: m.awayGoals ?? 0, phase: m.phase, penalties: m.penalties ?? false, played: true };
          playedMatches.push(match);
          apiPlayed.push({ match, start: new Date(m.utcDate).getTime() });
        });
      } catch { /* API unavailable, continue */ }
      const manualPlayed: Match[] = [];
      const manualSnap = await getDocs(collection(db, "matches"));
      manualSnap.docs.forEach(d => {
        const data = d.data() as Omit<Match, "id">;
        if (data.played) {
          const match: Match = { id: d.id, ...data };
          playedMatches.push(match);
          manualPlayed.push(match);
        }
      });

      const jornadaMatches: Match[] = [
        ...apiPlayed.filter(x => x.start >= cutoff).map(x => x.match),
        ...manualPlayed,
      ];

      // Clasificación acumulada de la porra (con TODOS los partidos jugados).
      const teamTotals = buildTeamTotals(playedMatches);
      const leaderboard = Object.entries(allBets)
        .map(([uname, data]) => ({
          uname,
          score: calcUserScore(data.favorites, data.antiFavorites, teamTotals),
        }))
        .sort((a, b) => b.score - a.score);

      const prompt = buildChroniclePrompt(allBets, jornadaMatches, leaderboard, chronicleContext.trim());
      const text = await generateText(prompt);
      setChroniclePreview(text);
      setChronicleMsg("Crónica generada correctamente.");
    } catch (e) {
      setChronicleMsg(`Error: ${String(e)}`);
    } finally {
      setChronicleGenerating(false);
    }
  }

  async function handlePublishChronicle() {
    if (!chroniclePreview) return;
    setChroniclePublishing(true);
    try {
      const dateKey = new Date().toISOString().slice(0, 10);
      await setDoc(groupDoc("chronicles", dateKey), { text: chroniclePreview, generatedAt: new Date(), generatedBy: currentUser ?? getGroupConfig().admin });
      setChronicleMsg("✓ Crónica publicada. Ya visible en /cronica.");
      setChroniclePreview(null);
    } catch (e) {
      setChronicleMsg(`Error al publicar: ${String(e)}`);
    } finally {
      setChroniclePublishing(false);
    }
  }

  function toggleTeam(teamId: string, isFavorite: boolean) {
    if (isFavorite) {
      setFavorites((c) => c.includes(teamId) ? c.filter((id) => id !== teamId) : [...c, teamId]);
    } else {
      setAntiFavorites((c) => c.includes(teamId) ? c.filter((id) => id !== teamId) : [...c, teamId]);
    }
  }

  function hasGroupInFavorites(group: string) {
    return favorites.some((id) => TEAMS.find((t) => t.id === id)?.group === group);
  }
  function hasGroupInAntifavorites(group: string) {
    return antiFavorites.some((id) => TEAMS.find((t) => t.id === id)?.group === group);
  }

  const favoritesCost  = useMemo(() => favorites.reduce((s, id) => s + (TEAMS.find((t) => t.id === id)?.price ?? 0), 0), [favorites]);
  const antiDiscount   = useMemo(() => antiFavorites.reduce((s, id) => s + (TEAMS.find((t) => t.id === id)?.price ?? 0), 0), [antiFavorites]);
  const ticketCost     = favoritesCost - antiDiscount;
  const overlap        = favorites.some((id) => antiFavorites.includes(id));

  const validationsBet = [
    { ok: favorites.length >= favoriteBounds.min && favorites.length <= favoriteBounds.max, text: `Favoritos: ${favoriteBounds.min}-${favoriteBounds.max} (actual ${favorites.length})` },
    { ok: antiFavorites.length >= antiBounds.min && antiFavorites.length <= antiBounds.max, text: `Antifavoritos: ${antiBounds.min}-${antiBounds.max} (actual ${antiFavorites.length})` },
    { ok: !hasDuplicateGroup(favorites), text: "No repetir grupo en favoritos" },
    { ok: !hasDuplicateGroup(antiFavorites), text: "No repetir grupo en antifavoritos" },
    { ok: !overlap, text: "Un equipo no puede estar en ambos bloques" },
    { ok: ticketCost >= ticketBounds.min && ticketCost <= ticketBounds.max, text: `Coste entre ${ticketBounds.min} y ${ticketBounds.max} pts (actual ${ticketCost} pts)` },
    { ok: superFavorite !== null, text: "Marca un favorito como campeón (★)" },
  ];
  const allValidBet = validationsBet.every((r) => r.ok);

  function handleLogout() {
    clearUser();
    router.push("/login");
  }

  if (!currentUser) return null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialisimo</h1>
          <span className="sub">{currentUser}</span>
        </div>
        <NavBar user={currentUser} />
        <button className="mini-action" onClick={handleLogout}>Cerrar sesión</button>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-crest placeholder">⚙</div>
          <div className="hero-text">
            <div className="hero-eyebrow">Panel de administración</div>
            <h2 className="hero-name">Admin</h2>
            <p className="lead">Gestión de usuarios, contraseñas y apuestas.</p>
          </div>
        </div>
      </section>

      <div className="admin-container">
        {/* Tabs */}
        <div className="admin-tabs">
          <button className={`admin-tab ${tab === "usuarios" ? "active" : ""}`} onClick={() => setTab("usuarios")}>Usuarios</button>
          <button className={`admin-tab ${tab === "contrasenas" ? "active" : ""}`} onClick={() => setTab("contrasenas")}>Contraseñas</button>
          <button className={`admin-tab ${tab === "apuestas" ? "active" : ""}`} onClick={() => setTab("apuestas")}>Apuestas</button>
          <button className={`admin-tab ${tab === "cronica" ? "active" : ""}`} onClick={() => setTab("cronica")}>Crónica IA</button>
        </div>

        {/* ── TAB: Usuarios ─────────────────────────────────────── */}
        {tab === "usuarios" && (
          <div className="admin-panel card">
            <h2>Gestión de usuarios</h2>
            {usersMsg && <p className="admin-msg">{usersMsg}</p>}
            {usersLoading ? (
              <p className="muted">Cargando…</p>
            ) : (
              <ul className="admin-user-list">
                {userList.map((u) => (
                  <li key={u} className="admin-user-item">
                    <span>{u}</span>
                    {u !== "Javi" && (
                      <button className="admin-remove-btn" onClick={() => handleRemoveUser(u)}>Eliminar</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form className="admin-add-form" onSubmit={handleAddUser}>
              <input
                type="text"
                value={newUser}
                onChange={(e) => setNewUser(e.target.value)}
                placeholder="Nombre del nuevo usuario"
                className="admin-input"
              />
              <button className="btn" type="submit">Añadir</button>
            </form>
          </div>
        )}

        {/* ── TAB: Contraseñas ──────────────────────────────────── */}
        {tab === "contrasenas" && (
          <div className="admin-panel card">
            <h2>Resetear contraseña</h2>
            <p className="muted">El usuario tendrá que crear una nueva contraseña la próxima vez que entre.</p>
            {pwMsg && <p className="admin-msg">{pwMsg}</p>}
            <div className="admin-row">
              <select className="admin-select" value={pwUser} onChange={(e) => setPwUser(e.target.value)}>
                <option value="">— Selecciona usuario —</option>
                {userList.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <button className="btn admin-danger-btn" onClick={handleResetPassword} disabled={!pwUser || pwBusy}>
                {pwBusy ? "Reseteando…" : "Resetear contraseña"}
              </button>
            </div>
          </div>
        )}

        {/* ── TAB: Apuestas ─────────────────────────────────────── */}
        {tab === "apuestas" && (
          <div className="admin-panel card">
            <h2>Editar apuesta</h2>

            <div className="admin-row">
              <select className="admin-select" value={betUser} onChange={(e) => { setBetUser(e.target.value); setBetLoaded(false); setBetMsg(null); }}>
                <option value="">— Selecciona usuario —</option>
                {userList.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <button className="btn" onClick={handleLoadBet} disabled={!betUser || betLoading}>
                {betLoading ? "Cargando…" : "Cargar apuesta"}
              </button>
            </div>

            {betMsg && <p className="admin-msg">{betMsg}</p>}

            {betLoaded && (
              <>
                <div className={`price-bar ${allValidBet ? "price-ok" : ticketCost > ticketBounds.max ? "price-over" : "price-under"}`} style={{ margin: "1rem 0", borderRadius: "8px" }}>
                  <div className="price-bar-inner">
                    <span className="price-bar-total">
                      <span className="price-bar-label">Apuesta de {betUser}</span>
                      <span className="price-bar-amount">{ticketCost} pts</span>
                    </span>
                    <span className="price-bar-range">rango válido: {ticketBounds.min}-{ticketBounds.max} pts</span>
                  </div>
                </div>

                <div className="bet-builder">
                  <section className="bet-section">
                    <div className="section-header">
                      <h3>Selecciona equipos</h3>
                      <div className="counters">
                        <span className="counter fav-counter"><span className="dot-fav" /> Favoritos {favorites.length}/9-12</span>
                        <span className="counter anti-counter"><span className="dot-anti" /> Antifavoritos {antiFavorites.length}/4-6</span>
                      </div>
                    </div>
                    <div className="groups-grid">
                      {groupLabels.map((group) => (
                        <div className="group-card" key={group}>
                          <h3 className="group-label">Grupo {group}</h3>
                          <div className="group-teams">
                            {(GROUP_POOL[group] ?? []).map((tname, idx) => {
                              const teamId = tname;
                              const isFav  = favorites.includes(teamId);
                              const isAnti = antiFavorites.includes(teamId);
                              const team   = TEAMS.find((t) => t.id === teamId);
                              return (
                                <div className="team-dual" key={teamId}>
                                  <div className="team-info">
                                    <span className="team-name">{tname}</span>
                                    {isFav && (
                                      <button
                                        type="button"
                                        className={`star-btn${superFavorite === teamId ? " star-btn--active" : ""}`}
                                        onClick={() => setSuperFavorite(superFavorite === teamId ? null : teamId)}
                                        title={superFavorite === teamId ? "Quitar superfavorito" : "Marcar como campeón (desempate)"}
                                      >
                                        {superFavorite === teamId ? "★" : "☆"}
                                      </button>
                                    )}
                                    <span className="team-price">{team?.price ?? 0} pts</span>
                                  </div>
                                  <div className="team-controls">
                                    <button
                                      className={`team-btn fav-btn ${isFav ? "active" : ""} ${!isFav && (favorites.length >= 12 || hasGroupInFavorites(group) || isAnti) ? "disabled" : ""}`}
                                      onClick={() => toggleTeam(teamId, true)}
                                      disabled={!isFav && (favorites.length >= 12 || hasGroupInFavorites(group) || isAnti)}
                                    />
                                    <button
                                      className={`team-btn anti-btn ${isAnti ? "active" : ""} ${!isAnti && (antiFavorites.length >= 6 || hasGroupInAntifavorites(group) || isFav) ? "disabled" : ""}`}
                                      onClick={() => toggleTeam(teamId, false)}
                                      disabled={!isAnti && (antiFavorites.length >= 6 || hasGroupInAntifavorites(group) || isFav)}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bet-actions">
                      <button
                        className={`btn confirm-btn ${allValidBet ? "" : "confirm-btn-disabled"}`}
                        disabled={!allValidBet || betSaving}
                        onClick={handleSaveBet}
                      >
                        {betSaving ? "Guardando…" : allValidBet ? `Guardar apuesta de ${betUser}` : "Completa la apuesta para guardar"}
                      </button>
                      <button
                        className="btn admin-danger-btn"
                        disabled={betSaving}
                        onClick={handleResetBet}
                        style={{ marginLeft: "0.75rem" }}
                      >
                        Resetear apuesta
                      </button>
                    </div>
                  </section>
                </div>

                <div className="grid" style={{ marginTop: "1.5rem" }}>
                  <article className="card highlight summary-card">
                    <h2>Resumen</h2>
                    <p>Favoritos: {favoritesCost} pts</p>
                    <p>Antifavoritos: −{antiDiscount} pts</p>
                    <p><strong>Total: {ticketCost} pts</strong></p>
                    <ul className="checks">
                      {validationsBet.map((r) => (
                        <li className={r.ok ? "ok" : "ko"} key={r.text}>{r.ok ? "✓" : "✗"} {r.text}</li>
                      ))}
                    </ul>
                  </article>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB: Crónica IA ───────────────────────────────────── */}
        {tab === "cronica" && (
          <div className="admin-panel card">
            <h2>Crónica IA</h2>
            <p className="muted" style={{ marginBottom: "1rem" }}>
              Lee todas las apuestas de Firebase, las manda a Gemini y guarda el power ranking sarcástico
              en <code>chronicles/latest</code>. Todos los usuarios lo ven en{" "}
              <a href="/cronica" target="_blank" rel="noreferrer">/cronica</a>.
            </p>
            <textarea
              value={chronicleContext}
              onChange={e => setChronicleContext(e.target.value)}
              placeholder="Contexto adicional para la crónica (opcional): resultados destacados, anécdotas, lo que quieras…"
              rows={5}
              style={{ width: "100%", marginBottom: "1rem", padding: "0.5rem", fontFamily: "inherit", fontSize: "0.9rem", borderRadius: "6px", border: "1px solid #ccc", resize: "vertical" }}
            />
            {chronicleMsg && <p className="admin-msg">{chronicleMsg}</p>}
            {!chroniclePreview ? (
              <button className="btn" onClick={handleGenerateChronicle} disabled={chronicleGenerating}>
                {chronicleGenerating ? "Generando… (puede tardar 15-20s)" : "Generar crónica con IA"}
              </button>
            ) : (
              <>
                <div style={{ whiteSpace: "pre-wrap", background: "#1a1a2e", color: "#e8e8f0", border: "1px solid #444", borderRadius: "6px", padding: "1rem", marginBottom: "1rem", fontSize: "0.9rem", maxHeight: "400px", overflowY: "auto" }}>
                  {chroniclePreview}
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button className="btn" onClick={handlePublishChronicle} disabled={chroniclePublishing}>
                    {chroniclePublishing ? "Publicando…" : "Publicar crónica"}
                  </button>
                  <button className="btn" onClick={handleGenerateChronicle} disabled={chronicleGenerating} style={{ background: "#888" }}>
                    {chronicleGenerating ? "Generando…" : "Regenerar"}
                  </button>
                  <button className="btn" onClick={() => { setChroniclePreview(null); setChronicleMsg(null); }} style={{ background: "#c0392b" }}>
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
