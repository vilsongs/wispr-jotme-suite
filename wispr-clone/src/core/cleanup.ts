/** Limpeza local (offline) do texto bruto que sai do Whisper. */

export interface DictionaryEntry {
  from: string;
  to: string;
}

// Anotações que o Whisper insere em trechos sem fala.
const BRACKETED = /\[[^\]]*\]/g;
const SOUND_NOTES =
  /\((?:risos?|música|music|inaudível|inaudible|aplausos|applause|silêncio|silence|laughs?|laughter|suspiro|sighs?|tosse|coughs?)\)/gi;

// Hesitações. "um" fica de fora porque é artigo em português.
const FILLERS = /(?<![\p{L}\p{N}])(?:hum+|hmm+|hm|ahn+|ãh+|uhm+|uh+|éé+|ehh+)(?![\p{L}\p{N}])[,.…]?/giu;

// Frases que o Whisper "alucina" quando o áudio é quase só silêncio.
const HALLUCINATIONS = [
  "obrigado por assistir",
  "obrigada por assistir",
  "thank you for watching",
  "thanks for watching",
  "inscreva-se no canal",
  "legendas pela comunidade amara.org",
  "subtitles by the amara.org community",
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
    return acc.replace(rx, () => to); // função: "$" no texto do usuário fica literal
  }, text);
}

const capitalizeFirst = (s: string): string => (s ? s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1) : s);

export function stripRepetitionLoops(text: string): string {
  const trimmed = text.trim();
  const loopRx = /\b(\p{L}+(?:[\s,]+\p{L}+){0,4})(?:[\s,.;:!?]+\1){2,}[\s,.;:!?]*/giu;
  const cleaned = trimmed.replace(loopRx, "").replace(/^[\s,.;:!?-]+|[\s,]+$/g, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
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
