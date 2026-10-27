/** Utilitários de áudio PCM: WAV 16-bit, nível RMS e detecção de silêncio. */

export const SAMPLE_RATE = 16_000;
const MIN_SPEECH_MS = 300;
const MIN_SPEECH_RMS = 0.005;
const TRIM_FRAME_SEC = 0.02;
const TRIM_PAD_SEC = 0.15;
// Whisper processa janelas de 30 s = 1500 posições de contexto (50 por segundo).
const CTX_PER_SECOND = 50;
const CTX_MARGIN_SECONDS = 4;
const CTX_MIN = 512;
const CTX_MAX = 1500;
const CTX_STEP = 64;

export function encodeWav16(samples: Float32Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // tamanho do bloco fmt
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits por amostra
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), 44 + i * 2);
  }
  return buf;
}

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function isLikelySilence(samples: Float32Array, sampleRate: number): boolean {
  const durationMs = (samples.length / sampleRate) * 1000;
  return durationMs < MIN_SPEECH_MS || rms(samples) < MIN_SPEECH_RMS;
}

/**
 * Remove o silêncio inicial e final antes de enviar ao Whisper, preservando
 * uma margem curta (150 ms) nas pontas para não cortar consoantes.
 */
export function trimSilence(samples: Float32Array, sampleRate: number): Float32Array {
  const frameLen = Math.max(1, Math.round(sampleRate * TRIM_FRAME_SEC));
  if (samples.length <= frameLen * 2) return samples;

  const pad = Math.round(sampleRate * TRIM_PAD_SEC);
  let first = -1;
  let last = -1;

  for (let offset = 0; offset + frameLen <= samples.length; offset += frameLen) {
    if (rms(samples.subarray(offset, offset + frameLen)) >= MIN_SPEECH_RMS) {
      first = offset;
      break;
    }
  }
  if (first === -1) return samples;

  for (let offset = samples.length - frameLen; offset >= first; offset -= frameLen) {
    if (rms(samples.subarray(offset, offset + frameLen)) >= MIN_SPEECH_RMS) {
      last = offset + frameLen;
      break;
    }
  }

  const start = Math.max(0, first - pad);
  const end = Math.min(samples.length, last + pad);
  return start === 0 && end === samples.length ? samples : samples.subarray(start, end);
}

/**
 * Janela de contexto de áudio proporcional à fala, para o Whisper não
 * processar 30 s quando a fala tem 5 s. A folga de 3 s preserva a qualidade
 * em termos em inglês e mantém frases curtas enxutas (mínimo 256).
 */
export function audioContextFor(durationSec: number): number {
  const raw = (durationSec + CTX_MARGIN_SECONDS) * CTX_PER_SECOND;
  const rounded = Math.ceil(raw / CTX_STEP) * CTX_STEP;
  return Math.min(CTX_MAX, Math.max(CTX_MIN, rounded));
}

export function concatChunks(chunks: readonly Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
