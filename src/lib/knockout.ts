import { ApiAllMatch, isLiveStatus } from "./football-api";
import { buildGroupStandings } from "./standings";
import { Match, Phase } from "./scoring";

const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export interface ResolvedSide {
  name: string;
  provisional: boolean;
}

// Crea un resolvedor de "huecos" del cuadro (ej. "1º Gr. E", "2º Gr. A",
// "M.3º A/B/C/D/F") usando la clasificación PROVISIONAL de los grupos que ya han
// empezado a jugar. Los grupos sin partidos y los huecos de rondas posteriores
// ("Gan. ...", "Por determinar") se devuelven sin tocar.
//
// IMPORTANTE: la asignación de mejores terceros es una ESTIMACIÓN. La oficial usa
// una tabla FIFA según qué grupos aportan terceros; aquí hacemos "mejor esfuerzo"
// (mejor tercero disponible entre los candidatos del hueco, sin duplicar).
export function makeBracketResolver(matches: ApiAllMatch[]): (text: string) => ResolvedSide {
  const groupMatches: Match[] = matches
    .filter((m) => m.phase === "groups" && (m.played || isLiveStatus(m.status)))
    .map((m) => ({
      id: m.id,
      home: m.home,
      away: m.away,
      homeGoals: m.homeGoals ?? 0,
      awayGoals: m.awayGoals ?? 0,
      phase: "groups" as Phase,
      penalties: m.penalties,
      played: true,
    }));

  const standings = buildGroupStandings(groupMatches);
  const hasPlayed = (g: string) => (standings[g]?.some((t) => t.played > 0)) ?? false;

  // Ranking provisional de terceros (solo grupos con partidos jugados).
  const thirds = GROUP_LETTERS
    .filter((g) => hasPlayed(g) && standings[g]?.[2])
    .map((g) => ({ group: g, t: standings[g][2] }))
    .sort(
      (a, b) =>
        b.t.pts - a.t.pts ||
        b.t.gd - a.t.gd ||
        b.t.gf - a.t.gf ||
        a.t.name.localeCompare(b.t.name, "es")
    );
  const qualifiedThirds = new Set(thirds.slice(0, 8).map((x) => x.group));
  const usedThirds = new Set<string>();

  function resolveDirect(text: string): string | null {
    const m = text.match(/^([12])º Gr\.\s*([A-L])$/);
    if (!m) return null;
    const group = m[2];
    const pos = Number(m[1]) - 1;
    if (!hasPlayed(group)) return null;
    return standings[group]?.[pos]?.name ?? null;
  }

  function resolveThird(text: string): string | null {
    const m = text.match(/^M\.3º\s*(.+)$/);
    if (!m) return null;
    const candidates = m[1].split("/").map((s) => s.trim());
    // Mejor tercero clasificado (top-8 provisional) entre los candidatos, sin repetir.
    for (const x of thirds) {
      if (candidates.includes(x.group) && qualifiedThirds.has(x.group) && !usedThirds.has(x.group)) {
        usedThirds.add(x.group);
        return x.t.name;
      }
    }
    return null;
  }

  return (text: string): ResolvedSide => {
    const direct = resolveDirect(text);
    if (direct) return { name: direct, provisional: true };
    const third = resolveThird(text);
    if (third) return { name: third, provisional: true };
    return { name: text, provisional: false };
  };
}
