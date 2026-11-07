import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { askClaude, ClaudeError, DEFAULT_MODEL, formatRecentTranscript, loadContextFolder } from "../src/core/claudeAssist";
import type { TranscriptTurn } from "../src/core/summary";

function turn(offsetMs: number, speaker: "you" | "them", text: string): TranscriptTurn {
  return { id: String(offsetMs), speaker, text, raw: text, offsetMs, durationMs: 1000, transcribeMs: 100 };
}

function sseResponse(events: unknown[], status = 200): Response {
  const body = events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join("");
  const encoder = new TextEncoder();
  const bytes = encoder.encode(body);
  // Quebra no meio de um evento para exercitar o buffer entre pedaços.
  const mid = Math.floor(bytes.length / 2);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, mid));
      controller.enqueue(bytes.slice(mid));
      controller.close();
    },
  });
  return new Response(stream, { status });
}

const delta = (text: string) => ({ type: "content_block_delta", delta: { type: "text_delta", text } });

describe("formatRecentTranscript", () => {
  it("keeps only the turns inside the window counted from the last turn", () => {
    const turns = [turn(0, "them", "muito antiga"), turn(200_000, "them", "recente"), turn(230_000, "you", "resposta")];
    const out = formatRecentTranscript(turns, 60_000);
    expect(out).not.toContain("muito antiga");
    expect(out).toContain("[03:20] Reunião: recente");
    expect(out).toContain("[03:50] Você: resposta");
  });

  it("returns an empty string when there are no turns", () => {
    expect(formatRecentTranscript([])).toBe("");
  });
});

describe("loadContextFolder", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jotme-ctx-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads only .md and .txt files in name order, labelled by file name", () => {
    writeFileSync(join(dir, "b.txt"), "segundo");
    writeFileSync(join(dir, "a.md"), "primeiro");
    writeFileSync(join(dir, "ignorado.docx"), "nao");
    mkdirSync(join(dir, "sub"));
    const out = loadContextFolder(dir);
    expect(out.indexOf("a.md")).toBeLessThan(out.indexOf("b.txt"));
    expect(out).toContain("primeiro");
    expect(out).toContain("segundo");
    expect(out).not.toContain("nao");
  });

  it("truncates to the character limit and says so, instead of cutting silently", () => {
    writeFileSync(join(dir, "grande.md"), "x".repeat(500));
    const out = loadContextFolder(dir, 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out).toMatch(/cortado/i);
  });

  it("does not add the cut notice when everything fits", () => {
    writeFileSync(join(dir, "pequeno.md"), "cabe tudo");
    expect(loadContextFolder(dir, 1000)).not.toMatch(/cortado/i);
  });

  it("fits a long report (about 80 pages) within the default limit", () => {
    writeFileSync(join(dir, "relatorio.md"), "palavra ".repeat(30_000)); // ~210 mil caracteres
    const out = loadContextFolder(dir);
    expect(out).not.toMatch(/cortado/i);
    expect(out.length).toBeGreaterThan(200_000);
  });

  it("returns an empty string for a missing or empty folder path", () => {
    expect(loadContextFolder(join(dir, "nao-existe"))).toBe("");
    expect(loadContextFolder("")).toBe("");
  });
});

describe("askClaude", () => {
  const turns = [turn(1000, "them", "Qual o prazo do relatório?")];

  it("streams deltas, returns the full text and sends a cached system block", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} };
      return sseResponse([delta("O prazo "), delta("é sexta."), { type: "message_stop" }]);
    };
    const received: string[] = [];
    const text = await askClaude({
      apiKey: "chave-de-teste",
      context: "Prazo do relatório: sexta-feira.",
      turns,
      fetchImpl,
      onDelta: (d) => received.push(d),
    });

    expect(text).toBe("O prazo é sexta.");
    expect(received).toEqual(["O prazo ", "é sexta."]);
    expect(captured!.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("chave-de-teste");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(String(captured!.init.body));
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(body.stream).toBe(true);
    const cached = body.system.find((b: { cache_control?: unknown }) => b.cache_control);
    expect(cached.text).toContain("Prazo do relatório: sexta-feira.");
    expect(body.messages[0].content).toContain("Qual o prazo do relatório?");
  });

  it("omits the cached material block when there is no context", async () => {
    let body: { system: Array<{ cache_control?: unknown }> } | null = null;
    const fetchImpl = async (_u: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return sseResponse([delta("ok")]);
    };
    await askClaude({ apiKey: "k", context: "", turns, fetchImpl, onDelta: () => {} });
    expect(body!.system.some((b) => b.cache_control)).toBe(false);
  });

  it("explains an invalid key without leaking it", async () => {
    const fetchImpl = async () => new Response("{}", { status: 401 });
    const err = await askClaude({ apiKey: "segredo123", context: "", turns, fetchImpl, onDelta: () => {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ClaudeError);
    expect((err as Error).message).toMatch(/chave/i);
    expect((err as Error).message).not.toContain("segredo123");
  });

  it("reports rate limits and other HTTP errors", async () => {
    const limited = await askClaude({ apiKey: "k", context: "", turns, fetchImpl: async () => new Response("{}", { status: 429 }), onDelta: () => {} }).catch((e: unknown) => e);
    expect((limited as Error).message).toMatch(/limite/i);
    const broken = await askClaude({ apiKey: "k", context: "", turns, fetchImpl: async () => new Response("{}", { status: 500 }), onDelta: () => {} }).catch((e: unknown) => e);
    expect((broken as Error).message).toContain("500");
  });

  it("raises an error event sent inside the stream", async () => {
    const fetchImpl = async () => sseResponse([{ type: "error", error: { message: "sobrecarregado" } }]);
    const err = await askClaude({ apiKey: "k", context: "", turns, fetchImpl, onDelta: () => {} }).catch((e: unknown) => e);
    expect((err as Error).message).toContain("sobrecarregado");
  });

  it("wraps network failures in a friendly message", async () => {
    const fetchImpl = async () => {
      throw new TypeError("fetch failed");
    };
    const err = await askClaude({ apiKey: "k", context: "", turns, fetchImpl, onDelta: () => {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ClaudeError);
    expect((err as Error).message).toMatch(/conex/i);
  });

  it("refuses to ask without a transcript", async () => {
    const err = await askClaude({ apiKey: "k", context: "", turns: [], fetchImpl: async () => sseResponse([]), onDelta: () => {} }).catch((e: unknown) => e);
    expect((err as Error).message).toMatch(/nenhuma fala/i);
  });
});
