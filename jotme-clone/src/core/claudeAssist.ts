/**
 * Assistente de respostas rápidas durante a reunião: manda os últimos minutos da transcrição
 * (e o material de apoio de uma pasta) para a API do Claude e devolve a resposta aos poucos.
 * Só o TEXTO sai do computador; o áudio continua 100% local.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FetchLike } from "./whisperClient";
import { formatClock, speakerLabel, type TranscriptTurn } from "./summary";

export const DEFAULT_MODEL = "claude-haiku-5-5";
export const MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5"] as const;
export type ClaudeModel = (typeof MODELS)[number];

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const DEFAULT_WINDOW_MS = 3 * 60_000;
// ~400 mil caracteres (~110 mil tokens): cabe um relatório de ~150 páginas com o cache do prompt ligado.
const MAX_CONTEXT_CHARS = 400_000;
const CUT_NOTICE = "\n\n[... material cortado: passou do limite de tamanho ...]";
const MAX_TOKENS = 350;
const REQUEST_TIMEOUT_MS = 30_000;
const CONTEXT_EXTENSIONS = [".md", ".txt"];

const INSTRUCTIONS = [
  "Você é um assistente discreto que acompanha uma reunião ao vivo em português do Brasil.",
  "A transcrição mostra 'Você' (o usuário) e 'Reunião' (os demais participantes).",
  "Responda ao ponto ou à pergunta mais recente que precisa de resposta, em no máximo 3 frases curtas, direto ao ponto.",
  "Use o material de apoio quando ele responder; se a resposta não estiver nele nem na conversa, diga que não tem a informação em vez de inventar.",
].join(" ");

export class ClaudeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ClaudeError";
  }
}

export interface AskOptions {
  apiKey: string;
  model?: string;
  context: string;
  turns: readonly TranscriptTurn[];
  onDelta(text: string): void;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}

/** Últimos minutos da conversa, contados a partir da fala mais recente. */
export function formatRecentTranscript(turns: readonly TranscriptTurn[], windowMs = DEFAULT_WINDOW_MS): string {
  if (turns.length === 0) return "";
  const cutoff = turns[turns.length - 1].offsetMs - windowMs;
  return turns
    .filter((t) => t.offsetMs >= cutoff)
    .map((t) => `[${formatClock(t.offsetMs)}] ${speakerLabel(t.speaker)}: ${t.text}`)
    .join("\n");
}

/** Lê os .md/.txt da pasta (sem subpastas), em ordem de nome, até o limite de caracteres. */
export function loadContextFolder(dir: string, maxChars = MAX_CONTEXT_CHARS): string {
  if (!dir || !existsSync(dir)) return "";
  let names: string[];
  try {
    names = readdirSync(dir).sort((a, b) => a.localeCompare(b, "pt-BR"));
  } catch {
    return "";
  }
  let out = "";
  for (const name of names) {
    if (out.length > maxChars) break;
    const path = join(dir, name);
    const isText = CONTEXT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
    if (!isText || !statSync(path).isFile()) continue;
    out += `## Arquivo: ${name}\n${readFileSync(path, "utf8").trim()}\n\n`;
  }
  if (out.length <= maxChars) return out;
  return out.slice(0, Math.max(0, maxChars - CUT_NOTICE.length)) + CUT_NOTICE;
}

function buildSystem(context: string): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [{ type: "text", text: INSTRUCTIONS }];
  if (context.trim()) {
    // O material fica em cache: só a primeira pergunta paga para ler; as seguintes saem mais rápidas.
    blocks.push({ type: "text", text: `MATERIAL DE APOIO:\n${context}`, cache_control: { type: "ephemeral" } });
  }
  return blocks;
}

function httpErrorMessage(status: number): string {
  if (status === 401 || status === 403) return "Chave de API inválida ou sem permissão. Confira a chave nos Ajustes.";
  if (status === 429) return "Limite de uso da API atingido. Tente de novo em instantes.";
  return `A API do Claude respondeu com erro HTTP ${status}.`;
}

/** Lê o fluxo SSE e entrega cada pedaço de texto; devolve o texto completo. */
async function readStream(body: ReadableStream<Uint8Array>, onDelta: (text: string) => void): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  const handleLine = (line: string): void => {
    if (!line.startsWith("data:")) return;
    let event: { type?: string; delta?: { type?: string; text?: string }; error?: { message?: string } };
    try {
      event = JSON.parse(line.slice(5).trim());
    } catch {
      return;
    }
    if (event.type === "error") throw new ClaudeError(`A API do Claude retornou um erro: ${event.error?.message ?? "desconhecido"}.`);
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
      full += event.delta.text;
      onDelta(event.delta.text);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line.trim());
  }
  if (buffer.trim()) handleLine(buffer.trim());
  return full;
}

export async function askClaude(opts: AskOptions): Promise<string> {
  const transcript = formatRecentTranscript(opts.turns);
  if (!transcript) throw new ClaudeError("Nenhuma fala transcrita ainda para o Claude analisar.");

  const fetchImpl = opts.fetchImpl ?? fetch;
  const signals = [AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...(opts.signal ? [opts.signal] : [])];
  let res: Response;
  try {
    res = await fetchImpl(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model: opts.model ?? DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        system: buildSystem(opts.context),
        messages: [{ role: "user", content: `Transcrição recente da reunião:\n${transcript}\n\nO que respondo agora?` }],
      }),
      signal: AbortSignal.any(signals),
    });
  } catch (err) {
    throw new ClaudeError("Sem conexão com a API do Claude. Verifique a internet.", { cause: err });
  }

  if (!res.ok) throw new ClaudeError(httpErrorMessage(res.status));
  if (!res.body) throw new ClaudeError("A API do Claude não enviou resposta.");
  return readStream(res.body, opts.onDelta);
}
