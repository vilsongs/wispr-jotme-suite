import { describe, expect, it } from "vitest";
import { applyDictionary, cleanTranscript } from "../src/core/cleanup";

describe("cleanTranscript", () => {
  it("trims the leading space and trailing newline Whisper adds", () => {
    expect(cleanTranscript(" Olá, tudo bem?\n")).toBe("Olá, tudo bem?");
  });

  it("removes bracketed annotations such as [Música] and [BLANK_AUDIO]", () => {
    expect(cleanTranscript("[Música] Bom dia [BLANK_AUDIO]")).toBe("Bom dia");
  });

  it("removes parenthesised sound descriptions", () => {
    expect(cleanTranscript("Vamos lá (risos) começar.")).toBe("Vamos lá começar.");
  });

  it("removes hesitation fillers in Portuguese and English without touching the article 'um'", () => {
    expect(cleanTranscript("Hum, eu acho que, ahn, é um bom plano, uh, right?")).toBe("Eu acho que, é um bom plano, right?");
  });

  it("drops the whole output when it is a known silence hallucination", () => {
    expect(cleanTranscript(" Obrigado por assistir!")).toBe("");
    expect(cleanTranscript("Thank you for watching.")).toBe("");
  });

  it("strips Amara.org subtitle credits anywhere", () => {
    expect(cleanTranscript("Fechado. Legendas pela comunidade Amara.org")).toBe("Fechado.");
  });

  it("keeps a legitimate sentence that merely contains a hallucination phrase", () => {
    expect(cleanTranscript("Eu disse obrigado por assistir à reunião.")).toBe("Eu disse obrigado por assistir à reunião.");
  });

  it("collapses whitespace and fixes spaces before punctuation", () => {
    expect(cleanTranscript("Oi  ,   tudo   bem ?")).toBe("Oi, tudo bem?");
  });

  it("capitalises the first letter, including accented ones", () => {
    expect(cleanTranscript("é isso mesmo")).toBe("É isso mesmo");
  });

  it("applies dictionary replacements", () => {
    expect(cleanTranscript("vou abrir o power bi", [{ from: "power bi", to: "Power BI" }])).toBe("Vou abrir o Power BI");
  });

  it("returns an empty string for empty or whitespace-only input", () => {
    expect(cleanTranscript("   \n ")).toBe("");
  });
});

describe("applyDictionary", () => {
  it("matches whole words only, case-insensitively", () => {
    expect(applyDictionary("Wisper e wisperflow", [{ from: "wisper", to: "Wispr" }])).toBe("Wispr e wisperflow");
  });

  it("handles accented boundaries and regex metacharacters safely", () => {
    expect(applyDictionary("ação c++ ação", [{ from: "c++", to: "C++" }])).toBe("ação C++ ação");
    expect(applyDictionary("ação", [{ from: "ação", to: "Ação" }])).toBe("Ação");
  });

  it("treats $ in the replacement literally (L1)", () => {
    expect(applyDictionary("custa dolar", [{ from: "dolar", to: "US$$ $&" }])).toBe("custa US$$ $&");
  });

  it("ignores empty entries", () => {
    expect(applyDictionary("texto", [{ from: "  ", to: "x" }])).toBe("texto");
  });
});
