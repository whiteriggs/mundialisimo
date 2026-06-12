// Parser de la crónica de LaIA en formato "periódico".
//
// LaIA genera un texto plano con marcadores en líneas propias:
//   TITULAR: ...
//   ENTRADILLA: ...
//   CRONICA:
//   <uno o más párrafos>
//   RANKING:
//   1 | Nombre | comentario sarcástico
//   2 | Nombre | comentario
//
// Si el texto no trae estos marcadores (crónicas antiguas), parse() devuelve
// null y la UI cae al render de texto plano.

export interface RankingItem {
  pos: number;
  name: string;
  comment: string;
}

export interface ParsedChronicle {
  headline: string;
  standfirst: string;
  body: string[]; // párrafos
  ranking: RankingItem[];
}

export function parseChronicle(text: string): ParsedChronicle | null {
  if (!text || !/^\s*TITULAR\s*:/im.test(text)) return null;

  const lines = text.replace(/\r/g, "").split("\n");
  let headline = "";
  let standfirst = "";
  const body: string[] = [];
  const ranking: RankingItem[] = [];

  type Section = "none" | "cronica" | "ranking";
  let section: Section = "none";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const mTit = line.match(/^TITULAR\s*:\s*(.*)$/i);
    if (mTit) { headline = mTit[1].trim(); section = "none"; continue; }

    const mEnt = line.match(/^ENTRADILLA\s*:\s*(.*)$/i);
    if (mEnt) { standfirst = mEnt[1].trim(); section = "none"; continue; }

    if (/^CRONICA\s*:?/i.test(line)) {
      section = "cronica";
      const rest = line.replace(/^CRONICA\s*:?/i, "").trim();
      if (rest) body.push(rest);
      continue;
    }

    if (/^RANKING\s*:?/i.test(line)) { section = "ranking"; continue; }

    if (section === "cronica") {
      body.push(line);
    } else if (section === "ranking") {
      // "1 | Nombre | comentario"  (tolera "1." y separadores - o |)
      const m = line.match(/^\s*(\d+)\s*[).|-]\s*([^|–-]+?)\s*[|–-]\s*(.+)$/);
      if (m) {
        ranking.push({ pos: Number(m[1]), name: m[2].trim(), comment: m[3].trim() });
      } else {
        // línea suelta dentro del ranking → adjuntar al comentario anterior
        const last = ranking[ranking.length - 1];
        if (last) last.comment += " " + line;
      }
    }
  }

  if (!headline && body.length === 0 && ranking.length === 0) return null;
  return { headline, standfirst, body, ranking };
}
