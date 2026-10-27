import { describe, expect, it, vi } from "vitest";
import { buildServerArgs, defaultThreads, waitUntilReady } from "../src/core/whisperServer";

describe("buildServerArgs", () => {
  it("binds to loopback only and passes model, threads, port and anti-repetition flags", () => {
    const args = buildServerArgs({ modelPath: "C:\\m.bin", threads: 8, port: 4567, language: "pt" });
    expect(args).toEqual([
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
});

describe("defaultThreads", () => {
  it("keeps 4 cores free and stays within [4, 8]", () => {
    expect(defaultThreads(16)).toBe(8);
    expect(defaultThreads(10)).toBe(6);
    expect(defaultThreads(8)).toBe(4);
    expect(defaultThreads(2)).toBe(4);
    expect(defaultThreads(32)).toBe(8);
  });
});

describe("waitUntilReady", () => {
  it("resolves once the server answers 200", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new TypeError("ECONNREFUSED");
      return new Response("ok", { status: 200 });
    });
    await expect(waitUntilReady("http://x", { fetchImpl, isAlive: () => true, timeoutMs: 1000, intervalMs: 1 })).resolves.toBeUndefined();
    expect(calls).toBe(3);
  });

  it("rejects when the process dies while waiting", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("ECONNREFUSED");
    });
    await expect(waitUntilReady("http://x", { fetchImpl, isAlive: () => false, timeoutMs: 1000, intervalMs: 1 })).rejects.toThrow(/encerrou/);
  });

  it("rejects after the timeout", async () => {
    const fetchImpl = vi.fn(async () => new Response("loading", { status: 503 }));
    await expect(waitUntilReady("http://x", { fetchImpl, isAlive: () => true, timeoutMs: 20, intervalMs: 5 })).rejects.toThrow(/tempo/);
  });
});
