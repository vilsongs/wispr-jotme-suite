/**
 * Geração local (100% offline) de Ata e Resumo Estruturado da Reunião:
 * - Estatísticas de participação (Você vs. Reunião)
 * - Pontos principais discutidos
 * - Próximos passos / Action Items detectados por padrões de compromisso
 * - Perguntas levantadas durante a conversa
 * - Exportação formatada em Markdown (.md) e Texto (.txt)
 */

import type { Speaker } from "./segmenter";

export interface TranscriptTurn {
  id: string;
  speaker: Speaker;
  text: string;
  raw: string;
  /** Milissegundos desde o início da reunião. */
  offsetMs: number;
  durationMs: number;
  transcribeMs: number;
}

export interface MeetingSummary {
  totalTurns: number;
  youWords: number;
  themWords: number;
  youSharePct: number;
  themSharePct: number;
  highlights: string[];
  actionItems: string[];
  questions: string[];
}

export interface MeetingSummaryInput {
  title: string;
  startedAt: number;
  durationMs: number;
  notes: string;
  turns: readonly TranscriptTurn[];
}

const ACTION_PATTERN =
  /\b(?:vou\s+\w+|vamos\s+\w+|precisamos\s+\w+|preciso\s+\w+|ficou\s+definid[oa]|combinado|próximo\s+passo|próximos\s+passos|tarefa|enviar|mandar|agendar|marcar\s+um|fazer\s+o\s+deploy|revisar|entregar| cobrar|até\s+(?:amanhã|segunda|terça|quarta|quinta|sexta|semana\s+que\s+vem))\b/i;

const SPEAKER_LABEL: Record<Speaker, string> = {
  you: "Você",
  them: "Reunião",
};

export function speakerLabel(speaker: Speaker): string {
  return SPEAKER_LABEL[speaker];
}

export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

export function buildMeetingSummary(turns: readonly TranscriptTurn[]): MeetingSummary {
  let youWords = 0;
  let themWords = 0;
  const actionItems: string[] = [];
  const questions: string[] = [];
  const candidates: Array<{ text: string; words: number }> = [];
  const seenActions = new Set<string>();
  const seenQuestions = new Set<string>();
  const seenHighlights = new Set<string>();

  for (const turn of turns) {
    const w = countWords(turn.text);
    if (turn.speaker === "you") youWords += w;
    else themWords += w;

    const prefix = `${speakerLabel(turn.speaker)} (${formatClock(turn.offsetMs)})`;
    for (const sentence of splitSentences(turn.text)) {
      const key = sentence.toLowerCase();
      if (sentence.endsWith("?") && !seenQuestions.has(key) && questions.length < 8) {
        seenQuestions.add(key);
        questions.push(`${prefix}: ${sentence}`);
      }
      if (ACTION_PATTERN.test(sentence) && !seenActions.has(key) && actionItems.length < 10) {
        seenActions.add(key);
        actionItems.push(`${prefix}: ${sentence}`);
      }
      const sw = countWords(sentence);
      if (sw >= 6 && !sentence.endsWith("?") && !seenHighlights.has(key)) {
        seenHighlights.add(key);
        candidates.push({ text: `${prefix}: ${sentence}`, words: sw });
      }
    }
  }

  const totalWords = youWords + themWords;
  const youSharePct = totalWords > 0 ? Math.round((youWords / totalWords) * 100) : 0;
  const themSharePct = totalWords > 0 ? 100 - youSharePct : 0;

  const highlights = candidates
    .sort((a, b) => b.words - a.words)
    .slice(0, 6)
    .map((c) => c.text);

  return {
    totalTurns: turns.length,
    youWords,
    themWords,
    youSharePct,
    themSharePct,
    highlights,
    actionItems,
    questions,
  };
}

export function formatMeetingMarkdown(meeting: MeetingSummaryInput): string {
  const summary = buildMeetingSummary(meeting.turns);
  const dateStr = new Date(meeting.startedAt).toLocaleString("pt-BR");
  const lines: string[] = [
    `# ${meeting.title || "Reunião sem título"}`,
    "",
    `- **Data:** ${dateStr}`,
    `- **Duração:** ${formatClock(meeting.durationMs)}`,
    `- **Participação:** Você (${summary.youSharePct}% · ${summary.youWords} palavras) | Reunião (${summary.themSharePct}% · ${summary.themWords} palavras)`,
    "",
  ];

  if (meeting.notes.trim()) {
    lines.push("## Notas Manuais", "", meeting.notes.trim(), "");
  }

  if (summary.actionItems.length > 0) {
    lines.push("## Próximos Passos (Action Items)", "");
    for (const item of summary.actionItems) lines.push(`- [ ] ${item}`);
    lines.push("");
  }

  if (summary.highlights.length > 0) {
    lines.push("## Pontos Principais", "");
    for (const h of summary.highlights) lines.push(`- ${h}`);
    lines.push("");
  }

  if (summary.questions.length > 0) {
    lines.push("## Perguntas Levantadas", "");
    for (const q of summary.questions) lines.push(`- ${q}`);
    lines.push("");
  }

  lines.push("## Transcrição Completa", "");
  if (meeting.turns.length === 0) {
    lines.push("_Nenhuma fala registrada._");
  } else {
    for (const t of meeting.turns) {
      lines.push(`**[${formatClock(t.offsetMs)}] ${speakerLabel(t.speaker)}:** ${t.text}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function formatMeetingText(meeting: MeetingSummaryInput): string {
  const summary = buildMeetingSummary(meeting.turns);
  const dateStr = new Date(meeting.startedAt).toLocaleString("pt-BR");
  const lines: string[] = [
    `${meeting.title || "Reunião sem título"}`,
    `Data: ${dateStr} | Duração: ${formatClock(meeting.durationMs)}`,
    `Participação: Você (${summary.youSharePct}%) | Reunião (${summary.themSharePct}%)`,
    "",
  ];

  if (meeting.notes.trim()) {
    lines.push("=== NOTAS MANUAIS ===", meeting.notes.trim(), "");
  }

  if (summary.actionItems.length > 0) {
    lines.push("=== PRÓXIMOS PASSOS ===");
    for (const item of summary.actionItems) lines.push(`* ${item}`);
    lines.push("");
  }

  if (summary.highlights.length > 0) {
    lines.push("=== PONTOS PRINCIPAIS ===");
    for (const h of summary.highlights) lines.push(`* ${h}`);
    lines.push("");
  }

  lines.push("=== TRANSCRIÇÃO ===");
  for (const t of meeting.turns) {
    lines.push(`[${formatClock(t.offsetMs)}] ${speakerLabel(t.speaker)}: ${t.text}`);
  }
  return lines.join("\n");
}
