import { describe, expect, it, vi } from "vitest";
import { DictationController, type DictationDeps } from "../src/core/dictation";

const SPEECH = new Float32Array(16000).fill(0.1); // 1 s of "speech"

function makeDeps(overrides: Partial<DictationDeps> = {}) {
  let clock = 1000;
  const timers: Array<() => void> = [];
  const deps: DictationDeps = {
    recorder: {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => SPEECH),
      cancel: vi.fn(async () => {}),
    },
    transcribe: vi.fn(async () => " olá mundo\n"),
    paste: vi.fn(async () => "pasted"),
    showOverlay: vi.fn(),
    playSound: vi.fn(),
    addHistory: vi.fn(),
    getDictionary: () => [],
    resetHotkey: vi.fn(),
    now: () => (clock += 250),
    log: vi.fn(),
    newId: () => "id-1",
    setTimer: vi.fn((fn: () => void) => {
      timers.push(fn);
      return timers.length;
    }),
    clearTimer: vi.fn(),
    sampleRate: 16000,
    maxRecordingMs: 60_000,
    ...overrides,
  };
  return { deps, fireTimers: () => timers.forEach((t) => t()) };
}

describe("DictationController", () => {
  it("runs the full flow: record → transcribe → clean → paste → history", async () => {
    const { deps } = makeDeps();
    const c = new DictationController(deps);

    await c.handle("start");
    expect(c.status).toBe("recording");
    expect(deps.showOverlay).toHaveBeenLastCalledWith("recording");
    expect(deps.playSound).toHaveBeenCalledWith("start");

    await c.handle("stop");

    expect(deps.transcribe).toHaveBeenCalledWith(expect.any(Buffer), 1);
    expect(deps.paste).toHaveBeenCalledWith("Olá mundo");
    expect(deps.addHistory).toHaveBeenCalledWith(expect.objectContaining({ id: "id-1", text: "Olá mundo", raw: " olá mundo\n" }));
    expect(deps.showOverlay).toHaveBeenLastCalledWith("hidden");
    expect(c.status).toBe("idle");
  });

  it("shows the locked state in hands-free mode", async () => {
    const { deps } = makeDeps();
    const c = new DictationController(deps);
    await c.handle("start");
    await c.handle("lock");
    expect(deps.showOverlay).toHaveBeenLastCalledWith("locked");
  });

  it("cancels without transcribing", async () => {
    const { deps } = makeDeps();
    const c = new DictationController(deps);
    await c.handle("start");
    await c.handle("cancel");
    expect(deps.recorder.cancel).toHaveBeenCalled();
    expect(deps.transcribe).not.toHaveBeenCalled();
    expect(deps.showOverlay).toHaveBeenLastCalledWith("hidden");
    expect(c.status).toBe("idle");
  });

  it("skips transcription for silence", async () => {
    const { deps } = makeDeps({
      recorder: { start: vi.fn(async () => {}), stop: vi.fn(async () => new Float32Array(16000)), cancel: vi.fn() },
    });
    const c = new DictationController(deps);
    await c.handle("start");
    await c.handle("stop");
    expect(deps.transcribe).not.toHaveBeenCalled();
    expect(deps.paste).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith("info", expect.stringContaining("silêncio"));
  });

  it("does not paste when the cleaned transcript is empty", async () => {
    const { deps } = makeDeps({ transcribe: vi.fn(async () => "[BLANK_AUDIO]") });
    const c = new DictationController(deps);
    await c.handle("start");
    await c.handle("stop");
    expect(deps.paste).not.toHaveBeenCalled();
    expect(deps.addHistory).not.toHaveBeenCalled();
  });

  it("applies the user dictionary", async () => {
    const { deps } = makeDeps({ transcribe: vi.fn(async () => "abre o power bi"), getDictionary: () => [{ from: "power bi", to: "Power BI" }] });
    const c = new DictationController(deps);
    await c.handle("start");
    await c.handle("stop");
    expect(deps.paste).toHaveBeenCalledWith("Abre o Power BI");
  });

  it("shows an error and returns to idle when transcription fails", async () => {
    const { deps } = makeDeps({ transcribe: vi.fn(async () => Promise.reject(new Error("servidor caiu"))) });
    const c = new DictationController(deps);
    await c.handle("start");
    await c.handle("stop");
    expect(deps.showOverlay).toHaveBeenLastCalledWith("error", "servidor caiu");
    expect(deps.playSound).toHaveBeenCalledWith("error");
    expect(deps.log).toHaveBeenCalledWith("error", expect.any(String), expect.any(Error));
    expect(c.status).toBe("idle");
  });

  it("reports a microphone failure and resets the hotkey", async () => {
    const { deps } = makeDeps({
      recorder: { start: vi.fn(async () => Promise.reject(new Error("NotAllowedError"))), stop: vi.fn(), cancel: vi.fn() },
    });
    const c = new DictationController(deps);
    await c.handle("start");
    expect(c.status).toBe("idle");
    expect(deps.showOverlay).toHaveBeenLastCalledWith("error", expect.stringContaining("microfone"));
    expect(deps.resetHotkey).toHaveBeenCalled();
  });

  it("ignores a new start while still processing", async () => {
    let release: () => void = () => {};
    const { deps } = makeDeps({ transcribe: vi.fn(() => new Promise<string>((r) => (release = () => r("oi")))) });
    const c = new DictationController(deps);
    await c.handle("start");
    const stopping = c.handle("stop");
    await vi.waitFor(() => expect(deps.transcribe).toHaveBeenCalled());
    await c.handle("start");
    expect(deps.recorder.start).toHaveBeenCalledTimes(1);
    release();
    await stopping;
  });

  it("ignores stop/lock/cancel when not recording", async () => {
    const { deps } = makeDeps();
    const c = new DictationController(deps);
    await c.handle("stop");
    await c.handle("lock");
    await c.handle("cancel");
    expect(deps.recorder.stop).not.toHaveBeenCalled();
    expect(deps.showOverlay).not.toHaveBeenCalled();
  });

  it("auto-stops at the maximum duration and resets the hotkey machine", async () => {
    const { deps, fireTimers } = makeDeps();
    const c = new DictationController(deps);
    await c.handle("start");
    fireTimers();
    await vi.waitFor(() => expect(deps.paste).toHaveBeenCalled());
    expect(deps.resetHotkey).toHaveBeenCalled();
  });

  it("hides the overlay and logs when cancelling the recorder fails (M1)", async () => {
    const { deps } = makeDeps({
      recorder: { start: vi.fn(async () => {}), stop: vi.fn(), cancel: vi.fn(async () => Promise.reject(new Error("rpc timeout"))) },
    });
    const c = new DictationController(deps);
    await c.handle("start");
    await expect(c.handle("cancel")).resolves.toBeUndefined();
    expect(deps.showOverlay).toHaveBeenLastCalledWith("hidden");
    expect(deps.log).toHaveBeenCalledWith("warn", expect.any(String), expect.any(Error));
    expect(c.status).toBe("idle");
  });

  it("keeps the dictation in history when pasting fails (M2)", async () => {
    const { deps } = makeDeps({ paste: vi.fn(async () => Promise.reject(new Error("bloqueado"))) });
    const c = new DictationController(deps);
    await c.handle("start");
    await c.handle("stop");
    expect(deps.addHistory).toHaveBeenCalledWith(expect.objectContaining({ text: "Olá mundo" }));
    expect(deps.showOverlay).toHaveBeenLastCalledWith("error", expect.stringContaining("histórico"));
  });

  it("still pastes when saving history fails", async () => {
    const { deps } = makeDeps({
      addHistory: vi.fn(() => {
        throw new Error("EPERM");
      }),
    });
    const c = new DictationController(deps);
    await c.handle("start");
    await c.handle("stop");
    expect(deps.paste).toHaveBeenCalled();
    expect(deps.showOverlay).toHaveBeenLastCalledWith("hidden");
  });

  it("asks the recorder to cancel when transcription fails, so the mic is released (M3)", async () => {
    const { deps } = makeDeps({ transcribe: vi.fn(async () => Promise.reject(new Error("x"))) });
    const c = new DictationController(deps);
    await c.handle("start");
    await c.handle("stop");
    expect(deps.recorder.cancel).toHaveBeenCalled();
  });

  it("asks the recorder to cancel when starting it fails or times out (M3)", async () => {
    const { deps } = makeDeps({
      recorder: { start: vi.fn(async () => Promise.reject(new Error("timeout"))), stop: vi.fn(), cancel: vi.fn(async () => {}) },
    });
    const c = new DictationController(deps);
    await c.handle("start");
    expect(deps.recorder.cancel).toHaveBeenCalled();
  });

  it("handles stop while the recorder is still starting", async () => {
    let finishStart: () => void = () => {};
    const { deps } = makeDeps({
      recorder: { start: vi.fn(() => new Promise<void>((r) => (finishStart = r))), stop: vi.fn(async () => SPEECH), cancel: vi.fn() },
    });
    const c = new DictationController(deps);
    const starting = c.handle("start");
    const stopping = c.handle("stop");
    finishStart();
    await starting;
    await stopping;
    expect(deps.paste).toHaveBeenCalledWith("Olá mundo");
  });

  it("resets the hotkey machine when a start is ignored during processing (L8)", async () => {
    let release: () => void = () => {};
    const { deps } = makeDeps({ transcribe: vi.fn(() => new Promise<string>((r) => (release = () => r("oi")))) });
    const c = new DictationController(deps);
    await c.handle("start");
    const stopping = c.handle("stop");
    await vi.waitFor(() => expect(deps.transcribe).toHaveBeenCalled());
    await c.handle("start");
    expect(deps.resetHotkey).toHaveBeenCalled();
    release();
    await stopping;
  });

  it("clears the max-duration timer when the user stops first", async () => {
    const { deps } = makeDeps();
    const c = new DictationController(deps);
    await c.handle("start");
    await c.handle("stop");
    expect(deps.clearTimer).toHaveBeenCalledWith(1);
  });
});
