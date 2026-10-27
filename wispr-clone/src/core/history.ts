/** Histórico local dos ditados, gravado em JSON (mais recente primeiro). */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface HistoryEntry {
  id: string;
  at: number;
  /** Texto final colado. */
  text: string;
  /** Saída bruta do Whisper, antes da limpeza. */
  raw: string;
  durationMs: number;
  transcribeMs: number;
}

const DEFAULT_MAX = 500;

const isEntry = (v: unknown): v is HistoryEntry => {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.at === "number" &&
    typeof e.text === "string" &&
    typeof e.raw === "string" &&
    typeof e.durationMs === "number" &&
    typeof e.transcribeMs === "number"
  );
};

function readEntries(file: string): HistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export class HistoryStore {
  private entries: readonly HistoryEntry[];

  constructor(
    private readonly file: string,
    private readonly max: number = DEFAULT_MAX,
  ) {
    this.entries = readEntries(file).slice(0, max);
  }

  list(): HistoryEntry[] {
    return [...this.entries];
  }

  add(entry: HistoryEntry): void {
    this.entries = [entry, ...this.entries].slice(0, this.max);
    this.persist();
  }

  clear(): void {
    this.entries = [];
    this.persist();
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.entries), "utf8");
    renameSync(tmp, this.file);
  }
}
