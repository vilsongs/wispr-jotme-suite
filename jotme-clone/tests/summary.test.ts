import { describe, expect, it } from "vitest";
import { buildMeetingSummary, formatClock, formatMeetingMarkdown, formatMeetingText, type TranscriptTurn } from "../src/core/summary";

const TURNS: TranscriptTurn[] = [
  {
    id: "1",
    speaker: "them",
    text: "Bom dia pessoal, como está o andamento da nova funcionalidade do painel financeiro?",
    raw: "bom dia",
    offsetMs: 5_000,
    durationMs: 4_000,
    transcribeMs: 220,
  },
  {
    id: "2",
    speaker: "you",
    text: "Amanhã eu vou fazer o deploy da nova feature e depois marcar um meeting com o time para pegar o feedback do cliente.",
    raw: "amanha",
    offsetMs: 12_000,
    durationMs: 6_000,
    transcribeMs: 240,
  },
];

describe("summary & Ata formatter", () => {
  it("formats clock in MM:SS and HH:MM:SS", () => {
    expect(formatClock(65_000)).toBe("01:05");
    expect(formatClock(3_661_000)).toBe("01:01:01");
  });

  it("extracts speaker shares, action items, questions and highlights", () => {
    const s = buildMeetingSummary(TURNS);
    expect(s.totalTurns).toBe(2);
    expect(s.youWords).toBeGreaterThan(0);
    expect(s.themWords).toBeGreaterThan(0);
    expect(s.youSharePct + s.themSharePct).toBe(100);
    expect(s.questions).toHaveLength(1);
    expect(s.questions[0]).toContain("Reunião (00:05):");
    expect(s.actionItems).toHaveLength(1);
    expect(s.actionItems[0]).toContain("Você (00:12):");
    expect(s.highlights.length).toBeGreaterThan(0);
  });

  it("formats Markdown and plain text Atas with manual notes", () => {
    const input = {
      title: "Alinhamento Semanal",
      startedAt: 1700000000000,
      durationMs: 120_000,
      notes: "Lembrar de validar credenciais.",
      turns: TURNS,
    };
    const md = formatMeetingMarkdown(input);
    expect(md).toContain("# Alinhamento Semanal");
    expect(md).toContain("## Notas Manuais");
    expect(md).toContain("## Próximos Passos (Action Items)");
    expect(md).toContain("## Perguntas Levantadas");
    expect(md).toContain("**[00:12] Você:**");

    const txt = formatMeetingText(input);
    expect(txt).toContain("Alinhamento Semanal");
    expect(txt).toContain("=== PRÓXIMOS PASSOS ===");
    expect(txt).toContain("[00:05] Reunião:");
  });
});
