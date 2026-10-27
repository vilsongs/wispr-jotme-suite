/** Sobe e mantém o whisper-server local (127.0.0.1), com o modelo carregado na memória. */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { buildServerArgs, waitUntilReady } from "../core/whisperServer";

const READY_TIMEOUT_MS = 90_000;
const READY_POLL_MS = 200;
const STDERR_TAIL_LINES = 20;
const EXE_NAME = "whisper-server.exe";

export interface WhisperProcessOptions {
  binDir: string;
  modelPath: string;
  threads: number;
  /** Arquivo onde o PID do servidor fica gravado, para encerrar órfãos após uma queda do app. */
  pidFile?: string;
  log(level: "info" | "warn" | "error", message: string, err?: unknown): void;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      srv.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("Sem porta livre."))));
    });
  });
}

/** true se o PID ainda pertence a um whisper-server (evita matar um processo que reaproveitou o número). */
function isWhisperPid(pid: number): boolean {
  try {
    const out = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
    return out.toLowerCase().includes(`"${EXE_NAME}"`);
  } catch {
    return false;
  }
}

export class WhisperProcess {
  private proc: ChildProcess | null = null;
  private starting: Promise<void> | null = null;
  private stopping = false;
  private stderrTail: string[] = [];
  baseUrl = "";

  constructor(private readonly opts: WhisperProcessOptions) {}

  get exePath(): string {
    return join(this.opts.binDir, EXE_NAME);
  }

  /** Lança erro legível se o binário ou o modelo não estiverem no lugar. */
  checkFiles(): void {
    if (!existsSync(this.exePath)) throw new Error(`whisper-server.exe não encontrado em ${this.opts.binDir}.`);
    if (!existsSync(this.opts.modelPath)) throw new Error(`Modelo não encontrado: ${this.opts.modelPath}.`);
  }

  private isAlive(): boolean {
    return this.proc !== null && this.proc.exitCode === null && this.proc.signalCode === null;
  }

  /** Garante o servidor de pé; se caiu, sobe de novo. Chamadas simultâneas compartilham a mesma subida. */
  ensureReady(): Promise<void> {
    if (this.isAlive() && !this.starting) return Promise.resolve();
    this.starting ??= this.launch().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  /** Encerra um servidor que ficou para trás de uma execução anterior que caiu. */
  private killOrphan(): void {
    const file = this.opts.pidFile;
    if (!file || !existsSync(file)) return;
    const pid = Number(readFileSync(file, "utf8"));
    if (Number.isInteger(pid) && pid > 0 && isWhisperPid(pid)) {
      try {
        process.kill(pid);
        this.opts.log("warn", `Encerrado whisper-server órfão (PID ${pid}).`);
      } catch (err) {
        this.opts.log("warn", `Não consegui encerrar o whisper-server órfão (PID ${pid}).`, err);
      }
    }
    rmSync(file, { force: true });
  }

  private spawnServer(port: number): ChildProcess {
    const args = buildServerArgs({ modelPath: this.opts.modelPath, threads: this.opts.threads, port, language: "pt" });
    const proc = spawn(this.exePath, args, { cwd: this.opts.binDir, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    proc.once("error", (err) => this.opts.log("error", "Falha ao executar o whisper-server.", err));
    proc.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
      this.stderrTail = [...this.stderrTail, ...chunk.split(/\r?\n/).filter(Boolean)].slice(-STDERR_TAIL_LINES);
    });
    proc.once("exit", (code, signal) => {
      if (this.stopping) return;
      this.opts.log("warn", `whisper-server encerrou (código ${code ?? "-"}, sinal ${signal ?? "-"}). Últimas linhas:\n${this.stderrTail.join("\n")}`);
    });
    if (proc.pid && this.opts.pidFile) writeFileSync(this.opts.pidFile, String(proc.pid), "utf8");
    return proc;
  }

  private async launch(): Promise<void> {
    this.checkFiles();
    this.killOrphan();
    const port = await freePort();
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.stderrTail = [];
    this.stopping = false;
    const proc = this.spawnServer(port);
    this.proc = proc;
    this.opts.log("info", `Iniciando whisper-server na porta ${port} com ${this.opts.threads} threads.`);
    const t0 = Date.now();
    try {
      await waitUntilReady(this.baseUrl, { isAlive: () => proc.exitCode === null && proc.pid !== undefined, timeoutMs: READY_TIMEOUT_MS, intervalMs: READY_POLL_MS });
    } catch (err) {
      // Não deixa um servidor meio-vivo: a próxima tentativa sobe um novo.
      this.stop();
      throw err;
    }
    this.opts.log("info", `Modelo carregado em ${Date.now() - t0} ms.`);
  }

  stop(): void {
    this.stopping = true;
    if (this.isAlive()) this.proc?.kill();
    this.proc = null;
    if (this.opts.pidFile) rmSync(this.opts.pidFile, { force: true });
  }
}
