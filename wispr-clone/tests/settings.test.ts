import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, parseDictionaryText, sanitizeSettings, saveSettings } from "../src/core/settings";

describe("sanitizeSettings", () => {
  it("returns defaults for garbage input", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings("x")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values and replaces invalid ones field by field", () => {
    const s = sanitizeSettings({ hotkey: "rctrl", language: "klingon", sounds: false, threads: 999, restoreClipboard: "yes" });
    expect(s.hotkey).toBe("rctrl");
    expect(s.language).toBe(DEFAULT_SETTINGS.language);
    expect(s.sounds).toBe(false);
    expect(s.threads).toBe(32);
    expect(s.restoreClipboard).toBe(DEFAULT_SETTINGS.restoreClipboard);
  });

  it("filters malformed dictionary entries and vocabulary words", () => {
    const s = sanitizeSettings({
      dictionary: [{ from: "a", to: "b" }, { from: "", to: "x" }, { from: 1 }, "lixo"],
      vocabulary: ["Vilson", "", 3, "  Power BI  "],
    });
    expect(s.dictionary).toEqual([{ from: "a", to: "b" }]);
    expect(s.vocabulary).toEqual(["Vilson", "Power BI"]);
  });

  it("caps list sizes", () => {
    const s = sanitizeSettings({ vocabulary: Array.from({ length: 500 }, (_, i) => `w${i}`) });
    expect(s.vocabulary).toHaveLength(200);
  });
});

describe("parseDictionaryText", () => {
  it("parses 'errado => certo' lines and skips blanks and malformed lines", () => {
    expect(parseDictionaryText("wisper => Wispr\n\nsem seta\n power bi=>Power BI ")).toEqual([
      { from: "wisper", to: "Wispr" },
      { from: "power bi", to: "Power BI" },
    ]);
  });
});

describe("loadSettings / saveSettings", () => {
  it("round-trips through a JSON file", () => {
    const file = join(mkdtempSync(join(tmpdir(), "wc-")), "settings.json");
    const saved = saveSettings(file, { ...DEFAULT_SETTINGS, sounds: false });
    expect(loadSettings(file)).toEqual(saved);
  });

  it("returns defaults when the file is missing or corrupt", () => {
    const dir = mkdtempSync(join(tmpdir(), "wc-"));
    expect(loadSettings(join(dir, "nao-existe.json"))).toEqual(DEFAULT_SETTINGS);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{nope");
    expect(loadSettings(bad)).toEqual(DEFAULT_SETTINGS);
  });

  it("sanitizes before writing", () => {
    const file = join(mkdtempSync(join(tmpdir(), "wc-")), "s.json");
    saveSettings(file, { ...DEFAULT_SETTINGS, threads: -5 } as never);
    expect(JSON.parse(readFileSync(file, "utf8")).threads).toBe(1);
  });
});
