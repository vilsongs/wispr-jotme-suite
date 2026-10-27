/**
 * Segmentador em tempo real por detecção de voz (VAD por energia RMS).
 * Acumula blocos de áudio de um canal ("you" ou "them") e emite um segmento
 * quando detecta uma pausa natural na fala ou quando atinge a duração máxima.
 */

import { concatChunks, rms } from "./wav";

export type Speaker = "you" | "them";

export interface SegmenterOptions {
  sampleRate: number;
  speechRms?: number;
  minSpeechMs?: number;
  pauseMs?: number;
  maxSegmentMs?: number;
  preRollChunks?: number;
  onSegment(samples: Float32Array, speechDurationMs: number): void;
}

const DEFAULT_SPEECH_RMS = 0.0045;
const DEFAULT_MIN_SPEECH_MS = 280;
const DEFAULT_PAUSE_MS = 650;
const DEFAULT_MAX_SEGMENT_MS = 10_000;
const DEFAULT_PRE_ROLL_CHUNKS = 3;

export class VoiceSegmenter {
  private readonly sampleRate: number;
  private readonly speechRms: number;
  private readonly minSpeechMs: number;
  private readonly pauseMs: number;
  private readonly maxSegmentMs: number;
  private readonly preRollChunks: number;
  private readonly onSegment: (samples: Float32Array, speechDurationMs: number) => void;

  private preRoll: Float32Array[] = [];
  private activeChunks: Float32Array[] = [];
  private speaking = false;
  private speechMs = 0;
  private silenceMs = 0;
  private totalMs = 0;

  constructor(opts: SegmenterOptions) {
    this.sampleRate = opts.sampleRate;
    this.speechRms = opts.speechRms ?? DEFAULT_SPEECH_RMS;
    this.minSpeechMs = opts.minSpeechMs ?? DEFAULT_MIN_SPEECH_MS;
    this.pauseMs = opts.pauseMs ?? DEFAULT_PAUSE_MS;
    this.maxSegmentMs = opts.maxSegmentMs ?? DEFAULT_MAX_SEGMENT_MS;
    this.preRollChunks = opts.preRollChunks ?? DEFAULT_PRE_ROLL_CHUNKS;
    this.onSegment = opts.onSegment;
  }

  push(chunk: Float32Array): void {
    if (chunk.length === 0) return;
    const chunkMs = (chunk.length / this.sampleRate) * 1000;
    const isSpeech = rms(chunk) >= this.speechRms;

    if (!this.speaking) {
      if (!isSpeech) {
        this.preRoll.push(chunk);
        if (this.preRoll.length > this.preRollChunks) this.preRoll.shift();
        return;
      }
      this.speaking = true;
      this.activeChunks = [...this.preRoll, chunk];
      this.preRoll = [];
      this.speechMs = chunkMs;
      this.silenceMs = 0;
      this.totalMs = this.activeChunks.reduce((acc, c) => acc + (c.length / this.sampleRate) * 1000, 0);
    } else {
      this.activeChunks.push(chunk);
      this.totalMs += chunkMs;
      if (isSpeech) {
        this.speechMs += chunkMs;
        this.silenceMs = 0;
      } else {
        this.silenceMs += chunkMs;
      }
    }

    if ((this.silenceMs >= this.pauseMs && this.speechMs >= this.minSpeechMs) || this.totalMs >= this.maxSegmentMs) {
      this.emitIfValid();
    } else if (this.silenceMs >= this.pauseMs && this.speechMs < this.minSpeechMs) {
      // Ruído muito curto (clique/tosse isolada): descarta e volta a ouvir
      this.reset();
    }
  }

  /** Emite imediatamente qualquer fala pendente (usado ao pausar ou encerrar a reunião). */
  flush(): void {
    if (this.speaking && this.speechMs >= this.minSpeechMs) {
      this.emitIfValid();
    } else {
      this.reset();
    }
  }

  reset(): void {
    this.preRoll = [];
    this.activeChunks = [];
    this.speaking = false;
    this.speechMs = 0;
    this.silenceMs = 0;
    this.totalMs = 0;
  }

  private emitIfValid(): void {
    const combined = concatChunks(this.activeChunks);
    const speechMs = this.speechMs;
    this.reset();
    if (combined.length > 0) {
      this.onSegment(combined, speechMs);
    }
  }
}
