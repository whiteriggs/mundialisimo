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
// IMPORTANTE: para "M.3º ..." NO resolvemos equipos de forma provisional,
// porque la asignación oficial depende de tablas FIFA de combinaciones.
// Se mantienen placeholders hasta que la API publique los cruces oficiales.
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

  function resolveDirect(text: string): string | null {
    const m = text.match(/^([12])º Gr\.\s*([A-L])$/);
    if (!m) return null;
    const group = m[2];
    const pos = Number(m[1]) - 1;
    if (!hasPlayed(group)) return null;
    return standings[group]?.[pos]?.name ?? null;
  }

  return (text: string): ResolvedSide => {
    const direct = resolveDirect(text);
    if (direct) return { name: direct, provisional: true };
    return { name: text, provisional: false };
  };
}
