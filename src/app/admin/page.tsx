"use client";

import NavBar from "@/components/NavBar";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { generateText } from "@/lib/gemini";
import { fetchAllMatches } from "@/lib/football-api";
import { Match } from "@/lib/scoring";
import { db } from "@/lib/firebase";
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

// Build positional ID → team name dynamically from the current GROUP_POOL
// (safe: run while the code still has the same group order that was used when bets were saved)
const posToName: Record<string, string> = {};
for (const [group, names] of Object.entries(GROUP_POOL)) {
  names.forEach((name, idx) => { posToName[`${group}-${idx + 1}`] = name; });
}
function translateId(id: string): string {
  return /^[A-L]-[1-4]$/.test(id) ? (posToName[id] ?? id) : id;
}

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

  // ── Migración state ───────────────────────────────────────────
  const [migrating, setMigrating]     = useState(false);
  const [migrateMsg, setMigrateMsg]   = useState<string | null>(null);

  // ── Crónica IA state ──────────────────────────────────────────
  const [chronicleGenerating, setChronicleGenerating] = useState(false);
  const [chronicleMsg, setChronicleMsg]               = useState<string | null>(null);
  const [chronicleContext, setChronicleContext]        = useState("");

  // ── Auth guard ────────────────────────────────────────────────
  useEffect(() => {
    const user = getStoredUser();
    if (!user) { router.push("/login"); return; }
    if (user !== "Javi") { router.push("/apuesta"); return; }
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
      const snap = await getDoc(doc(db, "bets", betUser.toLowerCase()));
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
      await setDoc(doc(db, "bets", betUser.toLowerCase()), {
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
      await setDoc(doc(db, "bets", betUser.toLowerCase()), {
        favorites: [],
        antiFavorites: [],
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
    playedMatches: Match[],
    extraContext = ""
  ): string {
    const teamInfo = Object.entries(GROUP_POOL)
      .map(([g, names]) => `  Grupo ${g}: ${names.map((n, i) => `${n}(${4 - i}pts)`).join(", ")}`)
      .join("\n");
    const betsInfo = Object.entries(allBets).map(([uname, data]) => {
      const favPts  = data.favorites.reduce((s, id) => s + (TEAMS.find(t => t.id === id)?.price ?? 0), 0);
      const antiPts = data.antiFavorites.reduce((s, id) => s + (TEAMS.find(t => t.id === id)?.price ?? 0), 0);
      const sfTeam  = data.superFavorite ? TEAMS.find(t => t.id === data.superFavorite) : null;
      const total   = favPts + antiPts + (sfTeam?.price ?? 0);
      const favNames  = data.favorites.map(id => TEAMS.find(t => t.id === id)?.name ?? id).join(", ");
      const antiNames = data.antiFavorites.map(id => TEAMS.find(t => t.id === id)?.name ?? id).join(", ");
      const netScore  = favPts - antiPts;
      return `${uname}:\n  Favoritos: ${favNames || "ninguno"}\n  Antifavoritos: ${antiNames || "ninguno"}\n  Superfavorito: ${sfTeam ? sfTeam.name : "ninguno"}\n  Puntuación neta: ${netScore}${total < 15 || total > 22 ? `\n  ⚠️ APUESTA FUERA DE RANGO` : ""}`;
    }).join("\n\n");
    const matchesInfo = playedMatches.length === 0
      ? "Aún no se han jugado partidos (análisis pre-torneo)."
      : playedMatches.map(m =>
          `${m.home} ${m.homeGoals}-${m.awayGoals} ${m.away}${m.penalties ? " (pen.)" : ""}`
        ).join("\n");
    const hasMatches = playedMatches.length > 0;
    return `Eres el analista oficial —sarcástico, con mala leche cariñosa y muy gracioso— de la Porra del Mundial 2026. Analiza las apuestas y ${hasMatches ? "los resultados ya jugados" : "haz un análisis pre-torneo"} para generar un power ranking en español.\n\nPERFILES DE LOS PARTICIPANTES (úsalos para personalizar los comentarios):\n- Esteban: siempre llega tarde y es un poco gafe. Del Espanyol y un poco del Madrid.\n- Juan: dice que viene y nunca viene. Tiene muchos pájaros en la cabeza.\n- Manuel: viaja más por trabajo que Willy Fog. Pero vive bien.\n- Jordi: le gusta la bici, es una extensión de su cuerpo.\n- Iris: más de libros que de estadios. Comparte techo con Capde y tribuna con Mariona, así que el fútbol le ha entrado por ósmosis, no por vocación. Las noches de verano domina el dominó (literalmente).\n- Capde: muy buena persona, muy trabajador, quizá demasiado. Runner y bici. As del dominó en las noches de verano.\n- Javi: el de los gadgets, tiene todos los cacharros habidos y por haber. El único soltero. Tiene un perro llamado Riggs que es lo mejor de su vida. Jugador habitual de dominó en las noches de verano.\n- Jorge: de Extremadura, con todo lo que eso conlleva. Sabe de medicinas... y de otras cosas. De trato directo, por decirlo fino.\n- Mariona: niña que juega al fútbol y al dominó en las noches de verano. Con ella sé animosa, divertida y alentadora, nada cruel. No menciones su edad.\n- Adri: niño que juega al basket. Con él sé animoso, divertido y alentador, nada cruel. No menciones su edad.\n- JuanRa: poco conocido, buen tío. Jugaba a fútbol con el grupo. Puede que no participe al final.\n\nREGLAS DE LA PORRA (léelas con atención para no confundir conceptos):\n- Cada participante elige equipos FAVORITOS y ANTIFAVORITOS.\n- Cada equipo tiene un VALOR DE APUESTA (1 a 4): no son puntos de torneo, es solo el coste para incluirlo en la apuesta.\n  · Valor 4 = gran favorito del grupo, Valor 3 = segundo, Valor 2 = tercero, Valor 1 = farolillo rojo.\n- La suma de valores de los FAVORITOS debe estar entre 9 y 12.\n- La suma de valores de los ANTIFAVORITOS debe estar entre 4 y 6.\n- El SUPERFAVORITO es un favorito cuyo valor se usará como desempate final (no altera los totales).\n- IMPORTANTE: los valores que aparecen en las apuestas (ej. "España(4)") son estos valores de apuesta (1-4), NO son puntos ganados en el torneo. NO intentes calcular puntos de torneo a partir de ellos.\n- Los ANTIFAVORITOS deben ser equipos flojos: meter un gigante de antifavorito es un error enorme.\n\nEQUIPOS DEL MUNDIAL 2026 (por grupo):\n${teamInfo}\n\nPARTIDOS JUGADOS:\n${matchesInfo}\n\nAPUESTAS:\n${betsInfo}\n\n${hasMatches ? "Comenta cómo les está yendo a cada uno según los resultados, quién acierta, quién está llorando y quién acertó sin querer." : "Analiza las estrategias pre-torneo: quién ha apostado bien, quién ha metido la pata y quién va a llorar."} Para cada participante, menciona su Puntuación neta (el número ya calculado, no lo recalcules) y coméntalo. Usa SOLO los rasgos del perfil dado, no añadas ni inventes otros. No uses palabrotas ni tacos. Usa emojis, sé divertido pero cruel (salvo con Adri y Mariona). Estructura:\n\n🏆 EL POWER RANKING OFICIAL DE LA PORRA 2026\n\n🥇 1º PUESTO: [nombre]\n[análisis de 3-4 líneas]\n\n🥈 2º PUESTO: [nombre]\n...\n\n🟥 FAROLILLO ROJO: [nombre]\n[crucifixión épica]${extraContext ? `\n\nCONTEXTO ADICIONAL (tenlo en cuenta al escribir la crónica):\n${extraContext}` : ""}`;
  }

  async function handleGenerateChronicle() {
    if (!confirm("Generar nueva crónica con IA. Puede tardar 10-20 segundos.")) return;
    setChronicleGenerating(true);
    setChronicleMsg(null);
    try {
      const users = await getUsers();
      const allBets: Record<string, { favorites: string[]; antiFavorites: string[]; superFavorite: string | null }> = {};
      for (const u of users) {
        const snap = await getDoc(doc(db, "bets", u.toLowerCase()));
        if (!snap.exists()) continue;
        const data = snap.data() as { favorites?: string[]; antiFavorites?: string[]; superFavorite?: string | null };
        allBets[u] = { favorites: data.favorites ?? [], antiFavorites: data.antiFavorites ?? [], superFavorite: data.superFavorite ?? null };
      }

      // Read played matches: API + manual Firestore
      const playedMatches: Match[] = [];
      try {
        const apiMatches = await fetchAllMatches();
        apiMatches.filter(m => m.played).forEach(m => {
          playedMatches.push({ id: m.id, home: m.home, away: m.away, homeGoals: m.homeGoals ?? 0, awayGoals: m.awayGoals ?? 0, phase: m.phase, penalties: m.penalties ?? false, played: true });
        });
      } catch { /* API unavailable, continue */ }
      const manualSnap = await getDocs(collection(db, "matches"));
      manualSnap.docs.forEach(d => {
        const data = d.data() as Omit<Match, "id">;
        if (data.played) playedMatches.push({ id: d.id, ...data });
      });

      const prompt = buildChroniclePrompt(allBets, playedMatches, chronicleContext.trim());
      const text = await generateText(prompt);
      const dateKey = new Date().toISOString().slice(0, 10);
      await setDoc(doc(db, "chronicles", dateKey), { text, generatedAt: new Date(), generatedBy: "Javi" });
      setChronicleMsg(`✓ Crónica generada (${playedMatches.length} partidos, ${Object.keys(allBets).length} apuestas). Ya visible en /cronica.`);
    } catch (e) {
      setChronicleMsg(`Error: ${String(e)}`);
    } finally {
      setChronicleGenerating(false);
    }
    setTimeout(() => setChronicleMsg(null), 12000);
  }

  async function handleMigrateBets() {
    if (!confirm("Migrar todas las apuestas al nuevo sistema de IDs (posición → nombre). Es seguro e idempotente.")) return;
    setMigrating(true);
    setMigrateMsg(null);
    let count = 0;
    try {
      const users = await getUsers();
      for (const user of users) {
        const snap = await getDoc(doc(db, "bets", user.toLowerCase()));
        if (!snap.exists()) continue;
        const data = snap.data() as { favorites?: string[]; antiFavorites?: string[]; superFavorite?: string | null; [k: string]: unknown };
        await setDoc(doc(db, "bets", user.toLowerCase()), {
          ...data,
          favorites:     (data.favorites     ?? []).map(translateId),
          antiFavorites: (data.antiFavorites ?? []).map(translateId),
          superFavorite: data.superFavorite ? translateId(data.superFavorite) : null,
        });
        count++;
      }
      setMigrateMsg(`Migración completada: ${count} apuestas actualizadas.`);
    } catch (e) {
      setMigrateMsg(`Error: ${String(e)}`);
    } finally {
      setMigrating(false);
    }
    setTimeout(() => setMigrateMsg(null), 8000);
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
        <NavBar user="Javi" />
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

            {/* Migración de IDs */}
            <div className="admin-panel card" style={{ marginBottom: "1.5rem", background: "var(--bg-3)" }}>
              <h3 style={{ marginBottom: "0.5rem" }}>Migración de IDs (una sola vez)</h3>
              <p className="muted" style={{ marginBottom: "0.75rem" }}>
                Convierte los IDs posicionales (H-2) a nombres de equipo (Uruguay) en todas las apuestas guardadas.
                Operación segura e idempotente: se puede ejecutar varias veces sin problema.
              </p>
              {migrateMsg && <p className="admin-msg">{migrateMsg}</p>}
              <button className="btn" onClick={handleMigrateBets} disabled={migrating}>
                {migrating ? "Migrando…" : "Migrar todas las apuestas"}
              </button>
            </div>
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
            <button className="btn" onClick={handleGenerateChronicle} disabled={chronicleGenerating}>
              {chronicleGenerating ? "Generando… (puede tardar 15-20s)" : "Generar crónica con IA"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
