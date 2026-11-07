import { describe, expect, it, vi } from "vitest";
import { VoiceSegmenter } from "../src/core/segmenter";

describe("VoiceSegmenter", () => {
  const sr = 16000;
  const chunkSamples = 3200; // 200 ms por bloco
  const silentChunk = () => new Float32Array(chunkSamples);
  const speechChunk = () => new Float32Array(chunkSamples).fill(0.08);

  it("emits a segment after speech followed by a natural pause, including pre-roll", () => {
    const onSegment = vi.fn();
    const seg = new VoiceSegmenter({ sampleRate: sr, minSpeechMs: 400, pauseMs: 400, preRollChunks: 1, onSegment });

    seg.push(silentChunk()); // pre-roll 1
    seg.push(silentChunk()); // pre-roll 2 (mantém só 1)
    seg.push(speechChunk()); // 200 ms fala
    seg.push(speechChunk()); // 400 ms fala
    seg.push(silentChunk()); // 200 ms pausa
    expect(onSegment).not.toHaveBeenCalled();

    seg.push(silentChunk()); // 400 ms pausa -> emite!
    expect(onSegment).toHaveBeenCalledOnce();
    const [samples, speechMs] = onSegment.mock.calls[0];
    expect(speechMs).toBe(400);
    // 1 pre-roll + 2 fala + 2 pausa = 5 blocos
    expect(samples.length).toBe(chunkSamples * 5);
  });

  it("discards very short noise bursts when followed by silence", () => {
    const onSegment = vi.fn();
    const seg = new VoiceSegmenter({ sampleRate: sr, minSpeechMs: 400, pauseMs: 400, onSegment });

    seg.push(speechChunk()); // só 200 ms (< 400 ms)
    seg.push(silentChunk());
    seg.push(silentChunk());
    expect(onSegment).not.toHaveBeenCalled();
  });

  it("forces segment emission when continuous speech reaches maxSegmentMs", () => {
    const onSegment = vi.fn();
    const seg = new VoiceSegmenter({ sampleRate: sr, minSpeechMs: 200, maxSegmentMs: 600, preRollChunks: 0, onSegment });

    seg.push(speechChunk()); // 200 ms
    seg.push(speechChunk()); // 400 ms
    seg.push(speechChunk()); // 600 ms -> emite!
    expect(onSegment).toHaveBeenCalledOnce();
  });

  it("after the soft limit, cuts at the first short pause instead of waiting for the full pause", () => {
    const onSegment = vi.fn();
    const seg = new VoiceSegmenter({
      sampleRate: sr,
      minSpeechMs: 200,
      pauseMs: 1000,
      softLimitMs: 800,
      softPauseMs: 400,
      maxSegmentMs: 5000,
      preRollChunks: 0,
      onSegment,
    });

    for (let i = 0; i < 4; i++) seg.push(speechChunk()); // 800 ms de fala contínua
    seg.push(silentChunk()); // 200 ms de pausa: ainda curta demais
    expect(onSegment).not.toHaveBeenCalled();
    seg.push(silentChunk()); // 400 ms de pausa: corta aqui, bem antes do 1000 ms
    expect(onSegment).toHaveBeenCalledOnce();
  });

  it("does not cut on a short pause before the soft limit is reached", () => {
    const onSegment = vi.fn();
    const seg = new VoiceSegmenter({
      sampleRate: sr,
      minSpeechMs: 200,
      pauseMs: 1000,
      softLimitMs: 2000,
      softPauseMs: 400,
      preRollChunks: 0,
      onSegment,
    });

    seg.push(speechChunk());
    seg.push(speechChunk());
    seg.push(silentChunk());
    seg.push(silentChunk()); // 400 ms de pausa, mas só 800 ms no total
    expect(onSegment).not.toHaveBeenCalled();
  });

  it("uses the faster defaults: 450 ms pause and an 8 s hard cap", () => {
    const onSegment = vi.fn();
    const seg = new VoiceSegmenter({ sampleRate: sr, preRollChunks: 0, onSegment });

    for (let i = 0; i < 2; i++) seg.push(speechChunk()); // 400 ms de fala
    seg.push(silentChunk());
    seg.push(silentChunk()); // 400 ms de pausa: ainda não
    expect(onSegment).not.toHaveBeenCalled();
    seg.push(silentChunk()); // 600 ms de pausa (>= 450): emite
    expect(onSegment).toHaveBeenCalledOnce();

    onSegment.mockClear();
    for (let i = 0; i < 39; i++) seg.push(speechChunk()); // 7,8 s contínuos
    expect(onSegment).not.toHaveBeenCalled();
    seg.push(speechChunk()); // 8,0 s: teto duro
    expect(onSegment).toHaveBeenCalledOnce();
  });

  it("flushes remaining speech when the meeting pauses or stops", () => {
    const onSegment = vi.fn();
    const seg = new VoiceSegmenter({ sampleRate: sr, minSpeechMs: 200, pauseMs: 1000, onSegment });

    seg.push(speechChunk());
    seg.push(speechChunk());
    seg.flush();
    expect(onSegment).toHaveBeenCalledOnce();
  });
});
