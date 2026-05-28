export type Team = {
  id: string;
  name: string;
  group: string;
  price: number;
};

export const GROUP_POOL: Record<string, string[]> = {
  A: ["México", "Sudáfrica", "Rep. Corea", "Rep. Checa"],
  B: ["Canadá", "Bosnia y Herz.", "Catar", "Suiza"],
  C: ["Brasil", "Marruecos", "Haití", "Escocia"],
  D: ["EE.UU.", "Paraguay", "Australia", "Turquía"],
  E: ["Alemania", "Costa Marfil", "Ecuador", "Curazao"],
  F: ["Países Bajos", "Japón", "Suecia", "Túnez"],
  G: ["Bélgica", "Egipto", "Irán", "Nueva Zelanda"],
  H: ["España", "Uruguay", "Arabia Saudí", "Cabo Verde"],
  I: ["Francia", "Noruega", "Senegal", "Irak"],
  J: ["Argentina", "Austria", "Argelia", "Jordania"],
  K: ["Portugal", "Colombia", "RD Congo", "Uzbekistán"],
  L: ["Inglaterra", "Croacia", "Ghana", "Panamá"],
};

export const TEAMS: Team[] = Object.entries(GROUP_POOL).flatMap(([group, names]) =>
  names.map((name, idx) => ({
    id: name,
    name,
    group,
    price: 4 - idx,
  }))
);

export const TEAM_NAMES: string[] = [...TEAMS.map((t) => t.name)].sort((a, b) =>
  a.localeCompare(b, "es")
);

export function teamById(id: string): Team | undefined {
  return TEAMS.find((t) => t.id === id);
}

export function teamName(id: string): string {
  return teamById(id)?.name ?? id;
}
