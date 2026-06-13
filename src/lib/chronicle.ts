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
  if (!text) return null;
  // Limpia restos de markdown que el modelo a veces cuela (negritas, almohadillas,
  // viñetas) para que las etiquetas TITULAR/ENTRADILLA/... se detecten siempre.
  const cleaned = text
    .replace(/\r/g, "")
    .replace(/\*\*/g, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "");

  if (!/^\s*TITULAR\s*:/im.test(cleaned)) return null;

  const lines = cleaned.split("\n");
  let headline = "";
  let standfirst = "";
  const body: string[] = [];
  const ranking: RankingItem[] = [];

  // "label" = acabamos de leer una etiqueta sin texto en su línea; la siguiente
  // línea no vacía es su contenido (algunos modelos ponen el titular debajo).
  type Section = "none" | "cronica" | "ranking";
  type Pending = "headline" | "standfirst" | null;
  let section: Section = "none";
  let pending: Pending = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const mTit = line.match(/^TITULAR\s*:\s*(.*)$/i);
    if (mTit) {
      headline = mTit[1].trim();
      pending = headline ? null : "headline";
      section = "none";
      continue;
    }

    const mEnt = line.match(/^ENTRADILLA\s*:\s*(.*)$/i);
    if (mEnt) {
      standfirst = mEnt[1].trim();
      pending = standfirst ? null : "standfirst";
      section = "none";
      continue;
    }

    if (/^CRONICA\s*:?/i.test(line)) {
      section = "cronica";
      pending = null;
      const rest = line.replace(/^CRONICA\s*:?/i, "").trim();
      if (rest) body.push(rest);
      continue;
    }

    if (/^RANKING\s*:?/i.test(line)) { section = "ranking"; pending = null; continue; }

    if (pending === "headline") { headline = line; pending = null; continue; }
    if (pending === "standfirst") { standfirst = line; pending = null; continue; }

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
