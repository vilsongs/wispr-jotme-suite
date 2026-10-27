import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HistoryStore, type HistoryEntry } from "../src/core/history";

const entry = (i: number): HistoryEntry => ({ id: `id${i}`, at: i, text: `texto ${i}`, raw: `raw ${i}`, durationMs: 1000, transcribeMs: 500 });
const tempFile = () => join(mkdtempSync(join(tmpdir(), "wc-h-")), "history.json");

describe("HistoryStore", () => {
  it("starts empty when the file does not exist", () => {
    expect(new HistoryStore(tempFile()).list()).toEqual([]);
  });

  it("adds newest first and persists to disk", () => {
    const file = tempFile();
    const store = new HistoryStore(file);
    store.add(entry(1));
    store.add(entry(2));
    expect(new HistoryStore(file).list().map((e) => e.id)).toEqual(["id2", "id1"]);
  });

  it("caps the number of entries", () => {
    const store = new HistoryStore(tempFile(), 3);
    [1, 2, 3, 4, 5].forEach((i) => store.add(entry(i)));
    expect(store.list().map((e) => e.id)).toEqual(["id5", "id4", "id3"]);
  });

  it("returns a copy so callers cannot mutate internal state", () => {
    const store = new HistoryStore(tempFile());
    store.add(entry(1));
    store.list().pop();
    expect(store.list()).toHaveLength(1);
  });

  it("clears entries", () => {
    const file = tempFile();
    const store = new HistoryStore(file);
    store.add(entry(1));
    store.clear();
    expect(new HistoryStore(file).list()).toEqual([]);
  });

  it("ignores a corrupt file and drops malformed entries", () => {
    const file = tempFile();
    writeFileSync(file, "não é json");
    expect(new HistoryStore(file).list()).toEqual([]);
    writeFileSync(file, JSON.stringify([entry(1), { id: 2 }, "x"]));
    expect(new HistoryStore(file).list().map((e) => e.id)).toEqual(["id1"]);
  });
});
