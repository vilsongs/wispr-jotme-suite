import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MeetingStore } from "../src/core/meetings";

describe("MeetingStore", () => {
  let dir = "";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jotme-meetings-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("saves, updates, searches and deletes meetings persistently", () => {
    const file = join(dir, "meetings.json");
    const store = new MeetingStore(file);
    expect(store.list()).toEqual([]);

    const saved = store.save({
      id: "m1",
      title: "Sprint Planning",
      startedAt: 1000,
      durationMs: 60000,
      notes: "Foco em performance Vulkan",
      turns: [
        { id: "t1", speaker: "you", text: "Vamos entregar o módulo amanhã.", raw: "vamos", offsetMs: 1000, durationMs: 2000, transcribeMs: 200 },
      ],
    });
    expect(saved.summary.actionItems.length).toBe(1);

    const reloaded = new MeetingStore(file);
    expect(reloaded.get("m1")?.title).toBe("Sprint Planning");
    expect(reloaded.search("vulkan")).toHaveLength(1);
    expect(reloaded.search("entregar")).toHaveLength(1);
    expect(reloaded.search("inexistente")).toHaveLength(0);

    reloaded.updateMeta("m1", { title: "Sprint Planning Q4", notes: "Atualizado" });
    expect(reloaded.get("m1")?.title).toBe("Sprint Planning Q4");

    expect(reloaded.remove("m1")).toBe(true);
    expect(reloaded.remove("m1")).toBe(false);
    expect(reloaded.list()).toHaveLength(0);
  });
});
