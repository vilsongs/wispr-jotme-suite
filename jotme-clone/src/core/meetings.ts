/** Persistência local de reuniões gravadas (transcrição, resumo, notas e busca). */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildMeetingSummary, type MeetingSummary, type TranscriptTurn } from "./summary";

export interface MeetingRecord {
  id: string;
  title: string;
  startedAt: number;
  durationMs: number;
  notes: string;
  turns: TranscriptTurn[];
  summary: MeetingSummary;
}

const MAX_MEETINGS = 200;

export class MeetingStore {
  private items: MeetingRecord[] | null = null;

  constructor(private readonly file: string) {}

  private ensureLoaded(): MeetingRecord[] {
    if (this.items !== null) return this.items;
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, "utf8"));
      this.items = Array.isArray(parsed) ? (parsed as MeetingRecord[]) : [];
    } catch {
      this.items = [];
    }
    return this.items;
  }

  private persist(): void {
    const items = this.ensureLoaded();
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    renameSync(tmp, this.file);
  }

  list(): readonly MeetingRecord[] {
    return this.ensureLoaded();
  }

  get(id: string): MeetingRecord | undefined {
    return this.ensureLoaded().find((m) => m.id === id);
  }

  save(record: Omit<MeetingRecord, "summary"> & { summary?: MeetingSummary }): MeetingRecord {
    const items = this.ensureLoaded();
    const full: MeetingRecord = {
      ...record,
      summary: record.summary ?? buildMeetingSummary(record.turns),
    };
    const idx = items.findIndex((m) => m.id === full.id);
    if (idx >= 0) items[idx] = full;
    else items.unshift(full);
    if (items.length > MAX_MEETINGS) items.length = MAX_MEETINGS;
    this.persist();
    return full;
  }

  updateMeta(id: string, patch: { title?: string; notes?: string }): MeetingRecord | null {
    const items = this.ensureLoaded();
    const found = items.find((m) => m.id === id);
    if (!found) return null;
    if (typeof patch.title === "string") found.title = patch.title.trim() || found.title;
    if (typeof patch.notes === "string") found.notes = patch.notes;
    this.persist();
    return found;
  }

  remove(id: string): boolean {
    const items = this.ensureLoaded();
    const before = items.length;
    this.items = items.filter((m) => m.id !== id);
    if (this.items.length === before) return false;
    this.persist();
    return true;
  }

  search(query: string): readonly MeetingRecord[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.list();
    return this.ensureLoaded().filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.notes.toLowerCase().includes(q) ||
        m.turns.some((t) => t.text.toLowerCase().includes(q)),
    );
  }
}
