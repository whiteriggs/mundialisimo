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
  E: ["Alemania", "Curazao", "Costa Marfil", "Ecuador"],
  F: ["Países Bajos", "Japón", "Suecia", "Túnez"],
  G: ["Bélgica", "Egipto", "Irán", "Nueva Zelanda"],
  H: ["España", "Cabo Verde", "Arabia Saudí", "Uruguay"],
  I: ["Francia", "Senegal", "Irak", "Noruega"],
  J: ["Argentina", "Argelia", "Austria", "Jordania"],
  K: ["Portugal", "RD Congo", "Uzbekistán", "Colombia"],
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

// Códigos cortos (3 letras) para encabezados compactos, p. ej. "MEX-SUD".
export const TEAM_CODES: Record<string, string> = {
  "México": "MEX", "Sudáfrica": "SUD", "Rep. Corea": "COR", "Rep. Checa": "CHE",
  "Canadá": "CAN", "Bosnia y Herz.": "BOS", "Catar": "CAT", "Suiza": "SUI",
  "Brasil": "BRA", "Marruecos": "MAR", "Haití": "HAI", "Escocia": "ESC",
  "EE.UU.": "USA", "Paraguay": "PAR", "Australia": "AUS", "Turquía": "TUR",
  "Alemania": "ALE", "Curazao": "CUR", "Costa Marfil": "CMA", "Ecuador": "ECU",
  "Países Bajos": "PBA", "Japón": "JAP", "Suecia": "SUE", "Túnez": "TUN",
  "Bélgica": "BEL", "Egipto": "EGI", "Irán": "IRA", "Nueva Zelanda": "NZL",
  "España": "ESP", "Cabo Verde": "CVE", "Arabia Saudí": "ARA", "Uruguay": "URU",
  "Francia": "FRA", "Senegal": "SEN", "Irak": "IRK", "Noruega": "NOR",
  "Argentina": "ARG", "Argelia": "ALG", "Austria": "AUT", "Jordania": "JOR",
  "Portugal": "POR", "RD Congo": "COD", "Uzbekistán": "UZB", "Colombia": "COL",
  "Inglaterra": "ING", "Croacia": "CRO", "Ghana": "GHA", "Panamá": "PAN",
};

export function teamCode(name: string): string {
  return TEAM_CODES[name] ?? name.slice(0, 3).toUpperCase();
}
