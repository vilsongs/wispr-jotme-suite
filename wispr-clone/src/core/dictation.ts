/**
 * Orquestra um ditado: gravar → transcrever (Whisper local) → limpar → colar → histórico.
 * Todas as dependências de sistema entram por injeção, para ser testável.
 */

import { cleanTranscript, type DictionaryEntry } from "./cleanup";
import type { HistoryEntry } from "./history";
import type { HotkeyEvent } from "./hotkeyMachine";
import { encodeWav16, isLikelySilence, rms, trimSilence } from "./wav";

export type OverlayPhase = "recording" | "locked" | "processing" | "error" | "hidden";
export type SoundKind = "start" | "stop" | "error";
export type DictationStatus = "idle" | "recording" | "processing";
type TimerHandle = unknown;

export interface RecorderPort {
  start(): Promise<void>;
  stop(): Promise<Float32Array>;
  cancel(): Promise<void> | void;
}

export interface DictationDeps {
  recorder: RecorderPort;
  transcribe(wav: Buffer, durationSec: number): Promise<string>;
  paste(text: string): Promise<unknown>;
  showOverlay(phase: OverlayPhase, message?: string): void;
  playSound(kind: SoundKind): void;
  addHistory(entry: HistoryEntry): void;
  getDictionary(): readonly DictionaryEntry[];
  /** Volta a máquina do atalho para "ocioso" (usado após parada automática, falha ou atalho ignorado). */
  resetHotkey(): void;
  now(): number;
  log(level: "info" | "warn" | "error", message: string, err?: unknown): void;
  newId(): string;
  setTimer(fn: () => void, ms: number): TimerHandle;
  clearTimer(handle: TimerHandle): void;
  sampleRate: number;
  maxRecordingMs: number;
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const PASTE_FAILED = "Não consegui colar. O texto está no histórico do painel.";

export class DictationController {
  private state: DictationStatus = "idle";
  private startedAt = 0;
  private starting: Promise<boolean> = Promise.resolve(false);
  private maxTimer: TimerHandle = null;

  constructor(private readonly deps: DictationDeps) {}

  get status(): DictationStatus {
    return this.state;
  }

  async handle(event: HotkeyEvent): Promise<void> {
    switch (event) {
      case "start":
        return this.start();
      case "lock":
        if (this.state === "recording") this.deps.showOverlay("locked");
        return;
      case "stop":
        return this.stop();
      case "cancel":
        return this.cancel();
    }
  }

  private async start(): Promise<void> {
    if (this.state !== "idle") {
      this.deps.log("info", `Atalho ignorado: ditado em andamento (${this.state}).`);
      this.deps.resetHotkey(); // senão um toque viraria "mãos-livres" sem gravação
      return;
    }
    this.state = "recording";
    this.startedAt = this.deps.now();
    this.deps.showOverlay("recording");
    this.deps.playSound("start");
    this.maxTimer = this.deps.setTimer(() => this.autoStop(), this.deps.maxRecordingMs);
    this.starting = this.deps.recorder.start().then(
      () => true,
      (err: unknown) => {
        this.fail("Não consegui acessar o microfone. Verifique a permissão do Windows.", err);
        return false;
      },
    );
    await this.starting;
  }

  private autoStop(): void {
    this.deps.log("info", "Duração máxima atingida; encerrando a gravação.");
    this.deps.resetHotkey();
    void this.stop();
  }

  private clearMaxTimer(): void {
    if (this.maxTimer !== null) this.deps.clearTimer(this.maxTimer);
    this.maxTimer = null;
  }

  /** Pede ao gravador para soltar o microfone, sem deixar uma falha aqui escapar. */
  private async releaseRecorder(): Promise<void> {
    try {
      await this.deps.recorder.cancel();
    } catch (err) {
      this.deps.log("warn", "O gravador não confirmou o cancelamento.", err);
    }
  }

  private async cancel(): Promise<void> {
    if (this.state !== "recording") return;
    this.clearMaxTimer();
    this.state = "idle";
    this.deps.showOverlay("hidden");
    if (await this.starting) await this.releaseRecorder();
  }

  private async stop(): Promise<void> {
    if (this.state !== "recording") return;
    this.clearMaxTimer();
    this.state = "processing";
    try {
      if (!(await this.starting)) return;
      this.deps.playSound("stop");
      this.deps.showOverlay("processing");
      const samples = await this.deps.recorder.stop();
      await this.process(samples);
    } catch (err) {
      this.fail(errorMessage(err), err);
    } finally {
      this.state = "idle";
    }
  }

  private async process(samples: Float32Array): Promise<void> {
    const { deps } = this;
    const trimmed = trimSilence(samples, deps.sampleRate);
    const durationSec = trimmed.length / deps.sampleRate;
    if (isLikelySilence(trimmed, deps.sampleRate)) {
      deps.log("info", `Ditado ignorado: silêncio (${durationSec.toFixed(1)} s, nível ${rms(trimmed).toFixed(4)}).`);
      deps.showOverlay("hidden");
      return;
    }
    const t0 = deps.now();
    const raw = await deps.transcribe(encodeWav16(trimmed, deps.sampleRate), durationSec);
    const transcribeMs = deps.now() - t0;
    const text = cleanTranscript(raw, deps.getDictionary());
    if (!text) {
      deps.log("info", "Ditado ignorado: transcrição vazia após a limpeza.");
      deps.showOverlay("hidden");
      return;
    }
    // O histórico vem antes da colagem: se colar falhar, o texto não se perde.
    this.saveHistory({ id: deps.newId(), at: this.startedAt, text, raw, durationMs: Math.round(durationSec * 1000), transcribeMs });
    try {
      await deps.paste(text);
    } catch (err) {
      this.fail(PASTE_FAILED, err);
      return;
    }
    deps.showOverlay("hidden");
  }

  private saveHistory(entry: HistoryEntry): void {
    try {
      this.deps.addHistory(entry);
    } catch (err) {
      this.deps.log("warn", "Não foi possível gravar o histórico.", err);
    }
  }

  private fail(message: string, err: unknown): void {
    this.clearMaxTimer();
    this.state = "idle";
    this.deps.log("error", message, err);
    this.deps.playSound("error");
    this.deps.showOverlay("error", message);
    this.deps.resetHotkey();
    void this.releaseRecorder(); // garante que o microfone não fica aberto
  }
}
