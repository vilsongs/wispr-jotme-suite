import { describe, expect, it, vi } from "vitest";
import { evaluateKeys, VK } from "../src/core/hotkeyPresets";
import { HotkeyWatcher } from "../src/core/hotkeyWatcher";

const downSet = (...vks: number[]) => (vk: number) => vks.includes(vk);

describe("evaluateKeys", () => {
  it("detects Ctrl+Win with either side of each key", () => {
    expect(evaluateKeys("ctrl+win", downSet(VK.LCONTROL, VK.CONTROL, VK.LWIN), true).combo).toBe(true);
    expect(evaluateKeys("ctrl+win", downSet(VK.RCONTROL, VK.CONTROL, VK.RWIN), true).combo).toBe(true);
    expect(evaluateKeys("ctrl+win", downSet(VK.LCONTROL, VK.CONTROL), true).combo).toBe(false);
  });

  it("detects right Ctrl alone and treats left Ctrl as another key", () => {
    expect(evaluateKeys("rctrl", downSet(VK.RCONTROL, VK.CONTROL), true)).toMatchObject({ combo: true, otherKey: false });
    expect(evaluateKeys("rctrl", downSet(VK.RCONTROL, VK.CONTROL, VK.LCONTROL), true).otherKey).toBe(true);
  });

  it("flags other keys pressed together with the combo", () => {
    expect(evaluateKeys("ctrl+win", downSet(VK.LCONTROL, VK.CONTROL, VK.LWIN, 0x44 /* D */), true).otherKey).toBe(true);
  });

  it("ignores mouse buttons and the injected mask key", () => {
    expect(evaluateKeys("ctrl+win", downSet(VK.LCONTROL, VK.CONTROL, VK.LWIN, 0x01, VK.MASK), true).otherKey).toBe(false);
  });

  it("skips the other-key scan when not requested", () => {
    const isDown = vi.fn(downSet(VK.LCONTROL, VK.LWIN, 0x44));
    expect(evaluateKeys("ctrl+win", isDown, false).otherKey).toBe(false);
    expect(isDown.mock.calls.length).toBeLessThan(10);
  });

  it("reports Escape", () => {
    expect(evaluateKeys("ctrl+win", downSet(VK.ESCAPE), true).escape).toBe(true);
  });
});

function makeWatcher(preset: "ctrl+win" | "rctrl" = "ctrl+win") {
  let pressed: number[] = [];
  let now = 0;
  let tick: () => void = () => {};
  const onEvent = vi.fn();
  const sendMaskKey = vi.fn();
  const watcher = new HotkeyWatcher({
    isDown: (vk) => pressed.includes(vk),
    sendMaskKey,
    onEvent,
    getPreset: () => preset,
    now: () => now,
    setInterval: (fn) => {
      tick = fn;
      return 1;
    },
    clearInterval: vi.fn(),
  });
  return {
    watcher,
    onEvent,
    sendMaskKey,
    press: (vks: number[], at: number) => {
      pressed = vks;
      now = at;
      tick();
    },
  };
}

describe("HotkeyWatcher", () => {
  it("emits start/stop for a push-to-talk hold and masks the Win key once", () => {
    const { watcher, onEvent, sendMaskKey, press } = makeWatcher();
    watcher.start();
    press([VK.LCONTROL, VK.CONTROL, VK.LWIN], 0);
    press([VK.LCONTROL, VK.CONTROL, VK.LWIN], 500);
    press([], 900);
    expect(onEvent.mock.calls.map((c) => c[0])).toEqual(["start", "stop"]);
    expect(sendMaskKey).toHaveBeenCalledOnce();
  });

  it("does not send the mask key for the right-Ctrl preset", () => {
    const { watcher, sendMaskKey, press } = makeWatcher("rctrl");
    watcher.start();
    press([VK.RCONTROL, VK.CONTROL], 0);
    expect(sendMaskKey).not.toHaveBeenCalled();
  });

  it("reset() returns to idle so the next press starts a new dictation", () => {
    const { watcher, onEvent, press } = makeWatcher();
    watcher.start();
    press([VK.LCONTROL, VK.CONTROL, VK.LWIN], 0);
    press([], 100); // toque rápido → lock
    watcher.reset();
    press([], 4000); // leitura com o atalho solto
    press([VK.LCONTROL, VK.CONTROL, VK.LWIN], 5000);
    expect(onEvent.mock.calls.map((c) => c[0])).toEqual(["start", "lock", "start"]);
  });

  it("stop() clears the polling interval and is idempotent", () => {
    const { watcher } = makeWatcher();
    watcher.start();
    watcher.start();
    watcher.stop();
    watcher.stop();
  });

  it("keeps polling if a listener throws", () => {
    const { watcher, onEvent, press } = makeWatcher();
    onEvent.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    watcher.start();
    expect(() => press([VK.LCONTROL, VK.CONTROL, VK.LWIN], 0)).not.toThrow();
    press([], 900);
    expect(onEvent).toHaveBeenCalledTimes(2);
  });
});
