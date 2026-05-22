const FLAGS: Record<string, string> = {
  // Grupo A
  "México": "🇲🇽",
  "Sudáfrica": "🇿🇦",
  "Rep. Corea": "🇰🇷",
  "Rep. Checa": "🇨🇿",
  // Grupo B
  "Canadá": "🇨🇦",
  "Bosnia y Herz.": "🇧🇦",
  "Catar": "🇶🇦",
  "Suiza": "🇨🇭",
  // Grupo C
  "Brasil": "🇧🇷",
  "Marruecos": "🇲🇦",
  "Haití": "🇭🇹",
  "Escocia": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  // Grupo D
  "EE.UU.": "🇺🇸",
  "Paraguay": "🇵🇾",
  "Australia": "🇦🇺",
  "Turquía": "🇹🇷",
  // Grupo E
  "Alemania": "🇩🇪",
  "Costa Marfil": "🇨🇮",
  "Ecuador": "🇪🇨",
  "Curazao": "🇨🇼",
  // Grupo F
  "Países Bajos": "🇳🇱",
  "Japón": "🇯🇵",
  "Suecia": "🇸🇪",
  "Túnez": "🇹🇳",
  // Grupo G
  "Bélgica": "🇧🇪",
  "Egipto": "🇪🇬",
  "Irán": "🇮🇷",
  "Nueva Zelanda": "🇳🇿",
  // Grupo H
  "España": "🇪🇸",
  "Uruguay": "🇺🇾",
  "Arabia Saudí": "🇸🇦",
  "Cabo Verde": "🇨🇻",
  // Grupo I
  "Francia": "🇫🇷",
  "Noruega": "🇳🇴",
  "Senegal": "🇸🇳",
  "Irak": "🇮🇶",
  // Grupo J
  "Argentina": "🇦🇷",
  "Austria": "🇦🇹",
  "Argelia": "🇩🇿",
  "Jordania": "🇯🇴",
  // Grupo K
  "Portugal": "🇵🇹",
  "Colombia": "🇨🇴",
  "RD Congo": "🇨🇩",
  "Uzbekistán": "🇺🇿",
  // Grupo L
  "Inglaterra": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Croacia": "🇭🇷",
  "Ghana": "🇬🇭",
  "Panamá": "🇵🇦",
};

export function flagFor(name: string): string {
  return FLAGS[name] ?? "";
}
