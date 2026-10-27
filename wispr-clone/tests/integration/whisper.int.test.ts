/**
 * Integração com o whisper-server real (binário + modelo em ./whisper).
 * Lento (~5 s): roda com `npm run test:int`, fora da suíte unitária.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanTranscript } from "../../src/core/cleanup";
import { audioContextFor, encodeWav16, SAMPLE_RATE, trimSilence } from "../../src/core/wav";
import { buildPrompt, transcribe } from "../../src/core/whisperClient";
import { WhisperProcess } from "../../src/electron/whisperProcess";

const ROOT = join(__dirname, "..", "..");
const BIN = join(ROOT, "whisper", "bin");
const MODEL = join(ROOT, "whisper", "models", "ggml-large-v3-turbo-q5_0.bin");
const available = existsSync(join(BIN, "whisper-server.exe")) && existsSync(MODEL);

/** Lê um WAV PCM 16-bit mono e devolve as amostras em float. */
function readWavSamples(file: string): Float32Array {
  const buf = readFileSync(file);
  const dataAt = buf.indexOf("data", 12, "ascii");
  const bytes = buf.readUInt32LE(dataAt + 4);
  const out = new Float32Array(bytes / 2);
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(dataAt + 8 + i * 2) / 0x8000;
  return out;
}

describe.skipIf(!available)("whisper-server local (integração)", () => {
  const logs: string[] = [];
  const proc = new WhisperProcess({ binDir: BIN, modelPath: MODEL, threads: 8, log: (_l, m) => logs.push(m) });

  beforeAll(() => proc.ensureReady(), 120_000);
  afterAll(() => proc.stop());

  it("transcreve fala em português com termos em inglês, pelo pipeline completo", async () => {
    const rawSamples = readWavSamples(join(ROOT, "tests", "fixtures", "amostra-pt.wav"));
    const samples = trimSilence(rawSamples, SAMPLE_RATE);
    const durationSec = samples.length / SAMPLE_RATE;
    const wav = encodeWav16(samples, SAMPLE_RATE);

    const t0 = Date.now();
    const raw = await transcribe(proc.baseUrl, wav, { language: "pt", prompt: buildPrompt([]), audioCtx: audioContextFor(durationSec) });
    const elapsed = Date.now() - t0;
    const text = cleanTranscript(raw);

    expect(text).toMatch(/^Olá, tudo bem\?/);
    for (const term of ["deploy", "feature", "meeting", "feedback"]) expect(text).toContain(term);
    expect(elapsed).toBeLessThan(8_000);
    process.stdout.write(`\n  ${durationSec.toFixed(1)} s de fala → ${elapsed} ms\n  "${text}"\n`);
  }, 60_000);

  it("falha com mensagem clara quando o modelo não existe", async () => {
    const broken = new WhisperProcess({ binDir: BIN, modelPath: join(ROOT, "whisper", "models", "nao-existe.bin"), threads: 4, log: () => {} });
    await expect(broken.ensureReady()).rejects.toThrow(/Modelo não encontrado/);
  });
});
