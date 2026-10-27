/** Cliente HTTP do whisper-server local (127.0.0.1 — nada sai da máquina). */

export type Language = "auto" | "pt" | "en";

export interface TranscribeOptions {
  language: Language;
  prompt?: string;
  audioCtx?: number;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class WhisperError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WhisperError";
  }
}

const BASE_PROMPT =
  "Transcrição de reunião em português do Brasil, com pontuação clara, e termos técnicos ou em inglês mantidos como falados, por exemplo: deploy, feature, meeting, feedback, sprint, roadmap.";

export function buildPrompt(vocabulary: readonly string[]): string {
  return vocabulary.length ? `${BASE_PROMPT} Vocabulário: ${vocabulary.join(", ")}.` : BASE_PROMPT;
}

export async function transcribe(baseUrl: string, wav: Buffer, opts: TranscribeOptions, fetchImpl: FetchLike = fetch): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "audio.wav");
  form.append("response_format", "json");
  form.append("language", opts.language);
  if (opts.prompt) form.append("prompt", opts.prompt);
  if (opts.audioCtx) form.append("audio_ctx", String(opts.audioCtx));

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/inference`, { method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new WhisperError(`A transcrição demorou demais (mais de ${Math.round(timeoutMs / 1000)} s).`, { cause: err });
    }
    throw new WhisperError("Não foi possível falar com o servidor de transcrição local.", { cause: err });
  }

  if (!res.ok) throw new WhisperError(`O servidor de transcrição respondeu HTTP ${res.status}.`);

  const body: unknown = await res.json().catch(() => null);
  if (body && typeof body === "object") {
    const rec = body as Record<string, unknown>;
    if (typeof rec.error === "string") throw new WhisperError(rec.error);
    if (typeof rec.text === "string") return rec.text;
  }
  throw new WhisperError("Resposta inesperada do servidor de transcrição.");
}
