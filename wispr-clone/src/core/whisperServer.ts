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
const MAX_THREADS = 8; // 1 thread por núcleo físico (ex.: Ryzen 7 5700X3D) evita contenção de SMT no ggml

export function defaultThreads(logicalCores: number): number {
  return Math.min(MAX_THREADS, Math.max(MIN_THREADS, logicalCores - RESERVED_CORES));
}

export function buildServerArgs(cfg: ServerConfig): string[] {
  return [
    "-m", cfg.modelPath,
    "-t", String(cfg.threads),
    "--host", "127.0.0.1", // só aceita conexões da própria máquina
    "--port", String(cfg.port),
    "-l", cfg.language,
    "-nt", // sem marcações de tempo no texto
    "-sns", // suprime tokens de não-fala ("(música)" etc.)
    "-fa", // flash attention (acelera encoder/decoder na GPU Vulkan e CPU)
    "-mc", "0", // evita reaproveitar tokens anteriores e propagar loops
    "-et", "2.20", // interrompe loops de repetição de baixa entropia
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
