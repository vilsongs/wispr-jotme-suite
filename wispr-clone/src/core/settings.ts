/** Preferências do usuário: valores padrão, validação campo a campo e persistência em JSON. */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname } from "node:path";
import type { DictionaryEntry } from "./cleanup";
import type { Language } from "./whisperClient";
import { defaultThreads } from "./whisperServer";

export type HotkeyPreset = "ctrl+win" | "rctrl";

export interface Settings {
  hotkey: HotkeyPreset;
  language: Language;
  restoreClipboard: boolean;
  sounds: boolean;
  threads: number;
  /** Substituições aplicadas depois da transcrição ("errado => certo"). */
  dictionary: DictionaryEntry[];
  /** Palavras que o Whisper deve grafar certo (nomes, siglas, jargões). */
  vocabulary: string[];
}

const HOTKEYS: readonly HotkeyPreset[] = ["ctrl+win", "rctrl"];
const LANGUAGES: readonly Language[] = ["pt", "auto", "en"];
const MAX_THREADS = 32;
const MAX_LIST = 200;
const MAX_WORD = 100;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  hotkey: "ctrl+win",
  language: "pt",
  restoreClipboard: true,
  sounds: true,
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
    hotkey: oneOf(s.hotkey, HOTKEYS, DEFAULT_SETTINGS.hotkey),
    language: oneOf(s.language, LANGUAGES, DEFAULT_SETTINGS.language),
    restoreClipboard: bool(s.restoreClipboard, DEFAULT_SETTINGS.restoreClipboard),
    sounds: bool(s.sounds, DEFAULT_SETTINGS.sounds),
    threads: sanitizeThreads(s.threads),
    dictionary: sanitizeDictionary(s.dictionary),
    vocabulary: sanitizeVocabulary(s.vocabulary),
  };
}

/** Converte o texto da tela de dicionário ("errado => certo" por linha) em entradas. */
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

/** Grava de forma atômica (arquivo temporário + rename) e devolve o que foi salvo. */
export function saveSettings(file: string, settings: Settings): Settings {
  const clean = sanitizeSettings(settings);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(clean, null, 2), "utf8");
  renameSync(tmp, file);
  return clean;
}
