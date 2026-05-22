// ISO 3166-1 alpha-2 codes para flagcdn.com
// Inglaterra y Escocia usan subdivisiones de GB
const CODES: Record<string, string> = {
  "México": "mx",
  "Sudáfrica": "za",
  "Rep. Corea": "kr",
  "Rep. Checa": "cz",
  "Canadá": "ca",
  "Bosnia y Herz.": "ba",
  "Catar": "qa",
  "Suiza": "ch",
  "Brasil": "br",
  "Marruecos": "ma",
  "Haití": "ht",
  "Escocia": "gb-sct",
  "EE.UU.": "us",
  "Paraguay": "py",
  "Australia": "au",
  "Turquía": "tr",
  "Alemania": "de",
  "Costa Marfil": "ci",
  "Ecuador": "ec",
  "Curazao": "cw",
  "Países Bajos": "nl",
  "Japón": "jp",
  "Suecia": "se",
  "Túnez": "tn",
  "Bélgica": "be",
  "Egipto": "eg",
  "Irán": "ir",
  "Nueva Zelanda": "nz",
  "España": "es",
  "Uruguay": "uy",
  "Arabia Saudí": "sa",
  "Cabo Verde": "cv",
  "Francia": "fr",
  "Noruega": "no",
  "Senegal": "sn",
  "Irak": "iq",
  "Argentina": "ar",
  "Austria": "at",
  "Argelia": "dz",
  "Jordania": "jo",
  "Portugal": "pt",
  "Colombia": "co",
  "RD Congo": "cd",
  "Uzbekistán": "uz",
  "Inglaterra": "gb-eng",
  "Croacia": "hr",
  "Ghana": "gh",
  "Panamá": "pa",
};

export function flagCode(name: string): string | null {
  return CODES[name] ?? null;
}

export function flagUrl(name: string): string | null {
  const code = flagCode(name);
  return code ? `https://flagcdn.com/20x15/${code}.png` : null;
}
