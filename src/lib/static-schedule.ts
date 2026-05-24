import type { ApiAllMatch } from "./football-api";
import { GROUP_POOL } from "./teams";

// Fechas aproximadas de jornada 1 por grupo (Mundial 2026, inicio 11 jun)
const MD1_DATE: Record<string, string> = {
  A: "2026-06-11", B: "2026-06-12", C: "2026-06-12", D: "2026-06-13",
  E: "2026-06-13", F: "2026-06-14", G: "2026-06-14", H: "2026-06-15",
  I: "2026-06-15", J: "2026-06-16", K: "2026-06-16", L: "2026-06-17",
};

function isoDate(base: string, offsetDays: number): string {
  const d = new Date(base + "T18:00:00Z");
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString();
}

// Cruces round-robin: jornada 1 → (0v1, 2v3), jornada 2 → (0v2, 1v3), jornada 3 → (0v3, 1v2)
const ROUNDS: [number, number][][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

export function buildStaticSchedule(): ApiAllMatch[] {
  const matches: ApiAllMatch[] = [];
  let n = 9000;

  for (const [group, teams] of Object.entries(GROUP_POOL)) {
    const base = MD1_DATE[group] ?? "2026-06-15";
    ROUNDS.forEach(([[a, b], [c, d]], round) => {
      const offset = round * 5; // ~5 días entre jornadas
      matches.push(
        {
          id: `static-${n++}`, utcDate: isoDate(base, offset),
          status: "SCHEDULED", stage: "GROUP_STAGE",
          home: teams[a], away: teams[b],
          homeGoals: null, awayGoals: null,
          phase: "groups", penalties: false, played: false, matchday: null,
        },
        {
          id: `static-${n++}`, utcDate: isoDate(base, offset),
          status: "SCHEDULED", stage: "GROUP_STAGE",
          home: teams[c], away: teams[d],
          homeGoals: null, awayGoals: null,
          phase: "groups", penalties: false, played: false, matchday: null,
        }
      );
    });
  }

  return matches.sort(
    (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime()
  );
}
