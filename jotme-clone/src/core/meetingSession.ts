/**
 * Orquestra uma sessão de reunião ao vivo:
 * - Gerencia o gravador duplo (Microfone = "you", Sistema = "them")
 * - Enfileira segmentos de fala por ordem de chegada e transcreve no Whisper local
 * - Limpa o texto, aplica dicionário e emite falas ao vivo para a barra flutuante e o painel
 * - Ao encerrar, gera a Ata/Resumo completo e salva no histórico de reuniões
 */

import { cleanTranscript, type DictionaryEntry } from "./cleanup";
import type { MeetingRecord } from "./meetings";
import type { Speaker } from "./segmenter";
import type { CaptureMode } from "./settings";
import { buildMeetingSummary, type TranscriptTurn } from "./summary";
import { encodeWav16, isLikelySilence, trimSilence } from "./wav";

export type SessionStatus = "idle" | "recording" | "paused" | "stopping";

export interface LiveSessionSnapshot {
  status: SessionStatus;
  meetingId: string | null;
  title: string;
  notes: string;
  captureMode: CaptureMode;
  startedAt: number;
  elapsedMs: number;
  pendingSegments: number;
  turns: readonly TranscriptTurn[];
  errorMessage?: string;
}

export interface DualRecorderPort {
  start(mode: CaptureMode): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
}

export interface MeetingSessionDeps {
  recorder: DualRecorderPort;
  transcribe(wav: Buffer, durationSec: number): Promise<string>;
  saveMeeting(record: MeetingRecord): MeetingRecord;
  getDictionary(): readonly DictionaryEntry[];
  getCaptureMode(): CaptureMode;
  onStateChange(snapshot: LiveSessionSnapshot): void;
  now(): number;
  newId(): string;
  sampleRate: number;
  log(level: "info" | "warn" | "error", message: string, err?: unknown): void;
}

export class MeetingSessionController {
  private status: SessionStatus = "idle";
  private meetingId: string | null = null;
  private title = "";
  private notes = "";
  private captureMode: CaptureMode = "both";
  private startedAt = 0;
  private accumulatedMs = 0;
  private lastResumedAt = 0;
  private turns: TranscriptTurn[] = [];
  private pendingSegments = 0;
  private queue: Promise<void> = Promise.resolve();
  private errorMessage?: string;

  constructor(private readonly deps: MeetingSessionDeps) {}

  getSnapshot(): LiveSessionSnapshot {
    const runningExtra = this.status === "recording" ? Math.max(0, this.deps.now() - this.lastResumedAt) : 0;
    return {
      status: this.status,
      meetingId: this.meetingId,
      title: this.title,
      notes: this.notes,
      captureMode: this.captureMode,
      startedAt: this.startedAt,
      elapsedMs: this.accumulatedMs + runningExtra,
      pendingSegments: this.pendingSegments,
      turns: [...this.turns],
      errorMessage: this.errorMessage,
    };
  }

  async start(initialTitle?: string): Promise<LiveSessionSnapshot> {
    if (this.status !== "idle") return this.getSnapshot();
    const now = this.deps.now();
    const defaultTitle = `Reunião ${new Date(now).toLocaleDateString("pt-BR")} ${new Date(now).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    this.meetingId = this.deps.newId();
    this.title = initialTitle?.trim() || defaultTitle;
    this.notes = "";
    this.captureMode = this.deps.getCaptureMode();
    this.startedAt = now;
    this.accumulatedMs = 0;
    this.lastResumedAt = now;
    this.turns = [];
    this.pendingSegments = 0;
    this.errorMessage = undefined;
    this.status = "recording";
    this.notify();

    try {
      await this.deps.recorder.start(this.captureMode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.deps.log("error", "Falha ao iniciar captura de áudio da reunião.", err);
      this.status = "idle";
      this.meetingId = null;
      this.errorMessage = `Não foi possível iniciar a captura de áudio: ${msg}`;
      this.notify();
    }
    return this.getSnapshot();
  }

  async pause(): Promise<LiveSessionSnapshot> {
    if (this.status !== "recording") return this.getSnapshot();
    this.accumulatedMs += Math.max(0, this.deps.now() - this.lastResumedAt);
    this.status = "paused";
    this.notify();
    try {
      await this.deps.recorder.pause();
    } catch (err) {
      this.deps.log("warn", "Falha ao pausar gravador.", err);
    }
    return this.getSnapshot();
  }

  async resume(): Promise<LiveSessionSnapshot> {
    if (this.status !== "paused") return this.getSnapshot();
    this.lastResumedAt = this.deps.now();
    this.status = "recording";
    this.notify();
    try {
      await this.deps.recorder.resume();
    } catch (err) {
      this.deps.log("warn", "Falha ao retomar gravador.", err);
    }
    return this.getSnapshot();
  }

  setTitle(title: string): LiveSessionSnapshot {
    if (title.trim()) this.title = title.trim();
    this.notify();
    return this.getSnapshot();
  }

  setNotes(notes: string): LiveSessionSnapshot {
    this.notes = notes;
    this.notify();
    return this.getSnapshot();
  }

  /** Recebe um segmento de áudio de um dos canais ("you" ou "them") e enfileira para transcrição. */
  pushSegment(speaker: Speaker, samples: Float32Array): Promise<void> {
    if (this.status === "idle") return Promise.resolve();
    const offsetMs = this.getSnapshot().elapsedMs;
    this.pendingSegments += 1;
    this.notify();

    const task = this.queue.then(() => this.processSegment(speaker, samples, offsetMs)).finally(() => {
      this.pendingSegments = Math.max(0, this.pendingSegments - 1);
      this.notify();
    });
    this.queue = task.catch(() => {});
    return task;
  }

  async stop(): Promise<MeetingRecord | null> {
    if (this.status !== "recording" && this.status !== "paused") return null;
    if (this.status === "recording") {
      this.accumulatedMs += Math.max(0, this.deps.now() - this.lastResumedAt);
    }
    this.status = "stopping";
    this.notify();

    try {
      await this.deps.recorder.stop();
    } catch (err) {
      this.deps.log("warn", "Erro ao parar gravador da reunião.", err);
    }

    // Aguarda terminar todos os trechos que já estavam na fila de transcrição
    await this.queue;

    const id = this.meetingId ?? this.deps.newId();
    const record: MeetingRecord = {
      id,
      title: this.title || "Reunião",
      startedAt: this.startedAt,
      durationMs: this.accumulatedMs,
      notes: this.notes,
      turns: [...this.turns],
      summary: buildMeetingSummary(this.turns),
    };

    const saved = this.deps.saveMeeting(record);
    this.status = "idle";
    this.meetingId = null;
    this.notify();
    return saved;
  }

  private async processSegment(speaker: Speaker, samples: Float32Array, offsetMs: number): Promise<void> {
    const { deps } = this;
    const trimmed = trimSilence(samples, deps.sampleRate);
    if (isLikelySilence(trimmed, deps.sampleRate)) return;

    const durationSec = trimmed.length / deps.sampleRate;
    const t0 = deps.now();
    try {
      const wav = encodeWav16(trimmed, deps.sampleRate);
      const raw = await deps.transcribe(wav, durationSec);
      const transcribeMs = deps.now() - t0;
      const text = cleanTranscript(raw, deps.getDictionary());
      if (!text) return;

      const turn: TranscriptTurn = {
        id: deps.newId(),
        speaker,
        text,
        raw,
        offsetMs: Math.max(0, Math.round(offsetMs - durationSec * 1000)),
        durationMs: Math.round(durationSec * 1000),
        transcribeMs,
      };
      this.turns.push(turn);
      deps.log("info", `[${speaker}] ${turn.durationMs} ms transcrito em ${transcribeMs} ms: "${text}"`);
      this.notify();
    } catch (err) {
      deps.log("error", `Falha ao transcrever segmento (${speaker}).`, err);
    }
  }

  private notify(): void {
    this.deps.onStateChange(this.getSnapshot());
  }
}
