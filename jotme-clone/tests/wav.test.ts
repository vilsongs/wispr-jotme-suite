import { describe, expect, it } from "vitest";
import { audioContextFor, concatChunks, encodeWav16, isLikelySilence, rms, trimSilence } from "../src/core/wav";

describe("encodeWav16", () => {
  it("writes a valid 16-bit mono PCM RIFF header", () => {
    const wav = encodeWav16(new Float32Array([0, 0.5, -0.5, 1]), 16000);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(8);
    expect(wav.length).toBe(44 + 8);
  });

  it("converts and clamps samples to int16", () => {
    const wav = encodeWav16(new Float32Array([0, 1, -1, 2, -2]), 16000);
    expect([0, 1, 2, 3, 4].map((i) => wav.readInt16LE(44 + i * 2))).toEqual([0, 32767, -32768, 32767, -32768]);
  });
});

describe("rms / silence / trimSilence", () => {
  it("computes root mean square", () => {
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rms(new Float32Array([]))).toBe(0);
  });

  it("detects silence", () => {
    expect(isLikelySilence(new Float32Array(1600).fill(0.3), 16000)).toBe(true);
    expect(isLikelySilence(new Float32Array(16000).fill(0.001), 16000)).toBe(true);
    expect(isLikelySilence(new Float32Array(16000).fill(0.1), 16000)).toBe(false);
  });

  it("trims leading and trailing silence with 150 ms pad", () => {
    const sr = 16000;
    const silent = new Float32Array(sr);
    const speech = new Float32Array(sr).fill(0.1);
    const trimmed = trimSilence(concatChunks([silent, speech, silent]), sr);
    expect(trimmed.length).toBe(Math.round(sr * 1.3));
  });

  it("returns original array when all silent or very short", () => {
    const quiet = new Float32Array(16000);
    expect(trimSilence(quiet, 16000)).toBe(quiet);
    const tiny = new Float32Array(100).fill(0.2);
    expect(trimSilence(tiny, 16000)).toBe(tiny);
  });
});

describe("audioContextFor & concatChunks", () => {
  it("computes audio context window", () => {
    expect(audioContextFor(1)).toBe(512);
    expect(audioContextFor(11.5)).toBe(832);
    expect(audioContextFor(40)).toBe(1500);
  });

  it("joins chunks in order", () => {
    expect(Array.from(concatChunks([new Float32Array([1, 2]), new Float32Array([3])]))).toEqual([1, 2, 3]);
  });
});
