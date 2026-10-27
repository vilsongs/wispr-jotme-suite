import { describe, expect, it } from "vitest";
import { applyDictionary, cleanTranscript, parseDictionaryLines } from "../src/core/cleanup";

describe("cleanTranscript", () => {
  it("removes Whisper silence hallucinations", () => {
    expect(cleanTranscript("Obrigado por assistir.")).toBe("");
    expect(cleanTranscript("Thank you for watching!")).toBe("");
    expect(cleanTranscript("Legendas pela comunidade Amara.org")).toBe("");
  });

  it("strips repetition loops caused by background noise or breathing", () => {
    expect(cleanTranscript("Um, um, um, um, um, um, um, um")).toBe("");
    expect(cleanTranscript("De uma, de uma, de uma, de uma, de uma")).toBe("");
    expect(cleanTranscript("Dein team. Dein team. Dein team. Dein team.")).toBe("");
    expect(cleanTranscript("E a gente, que tem que sejam, que sejam, que sejam, que sejam")).toBe("");
    expect(cleanTranscript("Por enquanto só eu estou falando, que sejam, que sejam, que sejam")).toBe(
      "Por enquanto só eu estou falando",
    );
  });

  it("removes bracketed notes, sound annotations and fillers", () => {
    expect(cleanTranscript("[BLANK_AUDIO] hum, vamos revisar o deploy (risos)")).toBe("Vamos revisar o deploy");
  });

  it("applies custom dictionary replacements case-insensitively and parses lines", () => {
    const dict = parseDictionaryLines("power bi => Power BI\ninvalida\n  => vazio");
    expect(dict).toEqual([{ from: "power bi", to: "Power BI" }]);
    expect(applyDictionary("abrir o power bi agora", [...dict, { from: "  ", to: "x" }])).toBe("abrir o Power BI agora");
  });
});
