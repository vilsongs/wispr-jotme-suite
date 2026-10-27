/** Partes testáveis do ciclo de vida do whisper-server (argumentos e espera de prontidão). */

import type { FetchLike, Language } from "./whisperClient";

export interface ServerConfig {
  modelPath: string;
  threads: number;
  port: number;
  language: Language;
}

const RESERVED_CORES = 4;
const MIN_THREADS = 4;
const MAX_THREADS = 8;

export function defaultThreads(logicalCores: number): number {
  return Math.min(MAX_THREADS, Math.max(MIN_THREADS, logicalCores - RESERVED_CORES));
}

export function buildServerArgs(cfg: ServerConfig): string[] {
  return [
    "-m", cfg.modelPath,
    "-t", String(cfg.threads),
    "--host", "127.0.0.1",
    "--port", String(cfg.port),
    "-l", cfg.language,
    "-nt",
    "-sns",
    "-fa",
    "-mc", "0", // não reaproveita tokens anteriores (evita propagação de loop de repetição)
    "-et", "2.20", // corta loops de baixa entropia ("um, um, um...")
  ];
}

export interface WaitOptions {
  fetchImpl?: FetchLike;
  isAlive: () => boolean;
  timeoutMs: number;
  intervalMs: number;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitUntilReady(baseUrl: string, opts: WaitOptions): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    if (!opts.isAlive()) throw new Error("O servidor de transcrição encerrou durante a inicialização.");
    try {
      const res = await fetchImpl(`${baseUrl}/`, { method: "GET" });
      if (res.ok) return;
    } catch {
      // ainda carregando o modelo — tenta de novo
    }
    await delay(opts.intervalMs);
  }
  throw new Error(`Esgotou o tempo esperando o servidor de transcrição (${opts.timeoutMs} ms).`);
}
