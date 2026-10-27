/** Preferências do usuário: modo de captura, idioma, modo furtivo, dicionário e vocabulário. */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname } from "node:path";
import type { DictionaryEntry } from "./cleanup";
import type { Language } from "./whisperClient";
import { defaultThreads } from "./whisperServer";

export type CaptureMode = "both" | "system" | "mic";

export interface Settings {
  captureMode: CaptureMode;
  language: Language;
  /** Oculta a janela flutuante em compartilhamentos de tela (Zoom, Meet, Teams). */
  stealthMode: boolean;
  /** Mostra a janela flutuante de legendas ao vivo durante a reunião. */
  showFloatingBar: boolean;
  threads: number;
  dictionary: DictionaryEntry[];
  vocabulary: string[];
}

const CAPTURE_MODES: readonly CaptureMode[] = ["both", "system", "mic"];
const LANGUAGES: readonly Language[] = ["pt", "auto", "en"];
const MAX_THREADS = 32;
const MAX_LIST = 200;
const MAX_WORD = 100;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  captureMode: "both",
  language: "pt",
  stealthMode: true,
  showFloatingBar: true,
  threads: defaultThreads(cpus().length),
  dictionary: [],
  vocabulary: [],
});

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const cleanWord = (v: unknown): string => (typeof v === "string" ? v.trim().slice(0, MAX_WORD) : "");

function sanitizeDictionary(v: unknown): DictionaryEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isRecord)
    .map((e) => ({ from: cleanWord(e.from), to: cleanWord(e.to) }))
    .filter((e) => e.from && e.to)
    .slice(0, MAX_LIST);
}

function sanitizeVocabulary(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(cleanWord).filter(Boolean).slice(0, MAX_LIST);
}

function sanitizeThreads(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_SETTINGS.threads;
  return Math.min(MAX_THREADS, Math.max(1, Math.round(v)));
}

export function sanitizeSettings(input: unknown): Settings {
  const s = isRecord(input) ? input : {};
  return {
    captureMode: oneOf(s.captureMode, CAPTURE_MODES, DEFAULT_SETTINGS.captureMode),
    language: oneOf(s.language, LANGUAGES, DEFAULT_SETTINGS.language),
    stealthMode: bool(s.stealthMode, DEFAULT_SETTINGS.stealthMode),
    showFloatingBar: bool(s.showFloatingBar, DEFAULT_SETTINGS.showFloatingBar),
    threads: sanitizeThreads(s.threads),
    dictionary: sanitizeDictionary(s.dictionary),
    vocabulary: sanitizeVocabulary(s.vocabulary),
  };
}

export function parseDictionaryText(text: string): DictionaryEntry[] {
  return sanitizeDictionary(
    text.split(/\r?\n/).map((line) => {
      const [from, to] = line.split("=>");
      return to === undefined ? {} : { from, to };
    }),
  );
}

export function loadSettings(file: string): Settings {
  try {
    return sanitizeSettings(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return sanitizeSettings(null);
  }
}

export function saveSettings(file: string, settings: Settings): Settings {
  const clean = sanitizeSettings(settings);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(clean, null, 2), "utf8");
  renameSync(tmp, file);
  return clean;
}
