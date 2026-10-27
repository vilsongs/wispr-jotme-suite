/** Limpeza local (offline) do texto bruto que sai do Whisper. */

export interface DictionaryEntry {
  from: string;
  to: string;
}

export function parseDictionaryLines(text: string): DictionaryEntry[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const [from, to] = line.split("=>");
      return { from: (from ?? "").trim(), to: (to ?? "").trim() };
    })
    .filter((e) => e.from.length > 0 && e.to.length > 0);
}

const BRACKETED = /\[[^\]]*\]/g;
const SOUND_NOTES =
  /\((?:risos?|música|music|inaudível|inaudible|aplausos|applause|silêncio|silence|laughs?|laughter|suspiro|sighs?|tosse|coughs?)\)/gi;
const FILLERS = /(?<![\p{L}\p{N}])(?:hum+|hmm+|hm|ahn+|ãh+|uhm+|uh+|éé+|ehh+)(?![\p{L}\p{N}])[,.…]?/giu;

const HALLUCINATIONS = [
  "obrigado por assistir",
  "obrigada por assistir",
  "thank you for watching",
  "thanks for watching",
  "inscreva-se no canal",
  "legendas pela comunidade amara.org",
  "subtitles by the amara.org community",
  "legendas em português",
];
const AMARA_CREDIT = /[^.!?]*amara\.org[^.!?]*[.!?]?/gi;

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeForCompare = (s: string): string =>
  s.toLowerCase().replace(/[.!?¡¿,…]/g, "").replace(/\s+/g, " ").trim();

export function applyDictionary(text: string, dictionary: readonly DictionaryEntry[]): string {
  return dictionary.reduce((acc, { from, to }) => {
    const needle = from.trim();
    if (!needle) return acc;
    const rx = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(needle)}(?![\\p{L}\\p{N}])`, "giu");
    return acc.replace(rx, () => to);
  }, text);
}

const capitalizeFirst = (s: string): string => (s ? s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1) : s);

/**
 * Remove loops de repetição gerados pelo Whisper em trechos de ruído/respiração
 * (ex.: "Um, um, um, um...", "De uma, de uma, de uma...", "Dein team. Dein team...").
 * Se a frase inteira era apenas um loop repetido, devolve string vazia.
 */
export function stripRepetitionLoops(text: string): string {
  const trimmed = text.trim();
  // Detecta 1 a 5 palavras repetidas 3+ vezes seguidas (separadas por espaço, vírgula ou ponto)
  const loopRx = /\b(\p{L}+(?:[\s,]+\p{L}+){0,4})(?:[\s,.;:!?]+\1){2,}[\s,.;:!?]*/giu;
  const cleaned = trimmed.replace(loopRx, "").replace(/^[\s,.;:!?-]+|[\s,]+$/g, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  // Se mais da metade da transcrição era um loop repetitivo ou sobrou só um fragmento curto, descarta tudo
  if (cleaned !== trimmed && (words.length <= 3 || cleaned.length < trimmed.length * 0.45)) return "";
  return cleaned;
}

export function cleanTranscript(raw: string, dictionary: readonly DictionaryEntry[] = []): string {
  if (HALLUCINATIONS.includes(normalizeForCompare(raw))) return "";

  const stripped = raw
    .replace(BRACKETED, " ")
    .replace(SOUND_NOTES, " ")
    .replace(AMARA_CREDIT, " ")
    .replace(FILLERS, " ");

  const tidy = stripRepetitionLoops(
    stripped
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?…])/g, "$1")
      .replace(/^[\s,.;:]+/, "")
      .trim(),
  );

  if (!tidy) return "";
  return capitalizeFirst(applyDictionary(tidy, dictionary));
}
