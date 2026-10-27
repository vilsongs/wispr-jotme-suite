import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, parseDictionaryText, sanitizeSettings, saveSettings } from "../src/core/settings";

describe("settings", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jotme-settings-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("sanitizes invalid inputs and preserves valid fields", () => {
    const s = sanitizeSettings({
      captureMode: "system",
      language: "en",
      stealthMode: false,
      showFloatingBar: false,
      threads: 8,
      vocabulary: ["  JotMe  ", ""],
      dictionary: [{ from: " jot me ", to: "JotMe" }],
    });
    expect(s.captureMode).toBe("system");
    expect(s.language).toBe("en");
    expect(s.stealthMode).toBe(false);
    expect(s.vocabulary).toEqual(["JotMe"]);
    expect(s.dictionary).toEqual([{ from: "jot me", to: "JotMe" }]);
  });

  it("parses dictionary text and saves/loads settings file", () => {
    const file = join(dir, "settings.json");
    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS);
    const dict = parseDictionaryText("errado => certo\nlinha invalida");
    expect(dict).toEqual([{ from: "errado", to: "certo" }]);

    saveSettings(file, { ...DEFAULT_SETTINGS, vocabulary: ["Vulkan"], dictionary: dict });
    const loaded = loadSettings(file);
    expect(loaded.vocabulary).toEqual(["Vulkan"]);
    expect(loaded.dictionary).toEqual([{ from: "errado", to: "certo" }]);
  });
});
