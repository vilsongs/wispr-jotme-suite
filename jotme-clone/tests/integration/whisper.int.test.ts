/**
 * Teste de integração real com o whisper-server + Vulkan na GPU AMD Radeon RX 6750 XT:
 * Simula dois canais da reunião ("them" e "you") e gera a Ata completa.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MeetingSessionController } from "../../src/core/meetingSession";
import { audioContextFor, SAMPLE_RATE } from "../../src/core/wav";
import { buildPrompt, transcribe } from "../../src/core/whisperClient";
import { WhisperProcess } from "../../src/electron/whisperProcess";

const ROOT = join(__dirname, "..", "..");
const BIN = join(ROOT, "whisper", "bin");
const MODEL = join(ROOT, "whisper", "models", "ggml-large-v3-turbo-q5_0.bin");
const available = existsSync(join(BIN, "whisper-server.exe")) && existsSync(MODEL);

function readWavSamples(file: string): Float32Array {
  const buf = readFileSync(file);
  const dataAt = buf.indexOf("data", 12, "ascii");
  const bytes = buf.readUInt32LE(dataAt + 4);
  const out = new Float32Array(bytes / 2);
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(dataAt + 8 + i * 2) / 0x8000;
  return out;
}

describe.skipIf(!available)("jotme-clone + whisper-server Vulkan (integração)", () => {
  const proc = new WhisperProcess({ binDir: BIN, modelPath: MODEL, threads: 8, log: () => {} });

  beforeAll(() => proc.ensureReady(), 120_000);
  afterAll(() => proc.stop());

  it("transcreve fala da reunião na GPU e gera Ata com Action Items automaticamente", async () => {
    const samples = readWavSamples(join(ROOT, "tests", "fixtures", "amostra-pt.wav"));

    const session = new MeetingSessionController({
      recorder: {
        start: async () => {},
        pause: async () => {},
        resume: async () => {},
        stop: async () => {},
      },
      transcribe: (wav, durationSec) =>
        transcribe(proc.baseUrl, wav, {
          language: "pt",
          prompt: buildPrompt([]),
          audioCtx: audioContextFor(durationSec),
        }),
      saveMeeting: (r) => r,
      getDictionary: () => [],
      getCaptureMode: () => "both",
      onStateChange: () => {},
      now: () => Date.now(),
      newId: () => "id-int",
      sampleRate: SAMPLE_RATE,
      log: () => {},
    });

    await session.start("Daily de Engenharia");
    const t0 = Date.now();
    await session.pushSegment("them", samples);
    const elapsed = Date.now() - t0;
    const meeting = await session.stop();

    expect(meeting).not.toBeNull();
    expect(meeting!.turns).toHaveLength(1);
    expect(meeting!.turns[0].speaker).toBe("them");
    expect(meeting!.turns[0].text).toMatch(/^Olá, tudo bem\?/);
    expect(meeting!.summary.actionItems.length).toBeGreaterThan(0);
    expect(meeting!.summary.questions.length).toBeGreaterThan(0);
    process.stdout.write(`\n  [JotMe Clone] Segmento de reunião transcrito em ${elapsed} ms → ${meeting!.summary.actionItems.length} action item(s) extraído(s)\n`);
  }, 60_000);
});
