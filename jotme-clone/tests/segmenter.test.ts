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

  it("flushes remaining speech when the meeting pauses or stops", () => {
    const onSegment = vi.fn();
    const seg = new VoiceSegmenter({ sampleRate: sr, minSpeechMs: 200, pauseMs: 1000, onSegment });

    seg.push(speechChunk());
    seg.push(speechChunk());
    seg.flush();
    expect(onSegment).toHaveBeenCalledOnce();
  });
});
