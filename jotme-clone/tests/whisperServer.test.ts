import { describe, expect, it, vi } from "vitest";
import { buildServerArgs, defaultThreads, waitUntilReady } from "../src/core/whisperServer";

describe("whisperServer", () => {
  it("builds args with Flash Attention and anti-repetition flags", () => {
    expect(buildServerArgs({ modelPath: "C:\\m.bin", threads: 8, port: 4567, language: "pt" })).toEqual([
      "-m", "C:\\m.bin",
      "-t", "8",
      "--host", "127.0.0.1",
      "--port", "4567",
      "-l", "pt",
      "-nt",
      "-sns",
      "-fa",
      "-mc", "0",
      "-et", "2.20",
    ]);
  });

  it("clamps defaultThreads to [4, 8]", () => {
    expect(defaultThreads(16)).toBe(8);
    expect(defaultThreads(8)).toBe(4);
    expect(defaultThreads(2)).toBe(4);
  });

  it("waits until ready or fails on dead process / timeout", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw new Error("booting");
      return new Response("ok", { status: 200 });
    });
    await expect(waitUntilReady("http://x", { fetchImpl, isAlive: () => true, timeoutMs: 500, intervalMs: 1 })).resolves.toBeUndefined();
    await expect(waitUntilReady("http://x", { fetchImpl, isAlive: () => false, timeoutMs: 500, intervalMs: 1 })).rejects.toThrow(/encerrou/);
    await expect(
      waitUntilReady("http://x", { fetchImpl: async () => new Response("", { status: 503 }), isAlive: () => true, timeoutMs: 15, intervalMs: 5 }),
    ).rejects.toThrow(/tempo/);
  });
});
