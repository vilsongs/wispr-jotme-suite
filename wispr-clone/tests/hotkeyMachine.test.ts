import { describe, expect, it } from "vitest";
import { initialHotkeyState, stepHotkey, TAP_MAX_MS, type HotkeyState, type KeySnapshot } from "../src/core/hotkeyMachine";

const snap = (now: number, over: Partial<KeySnapshot> = {}): KeySnapshot => ({
  combo: false,
  escape: false,
  otherKey: false,
  now,
  ...over,
});

function run(steps: KeySnapshot[], start: HotkeyState = initialHotkeyState()) {
  let state = start;
  const events: string[] = [];
  for (const s of steps) {
    const r = stepHotkey(state, s);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

describe("stepHotkey", () => {
  it("emits start when the combo goes down and stop when released after holding", () => {
    const { events, state } = run([snap(0, { combo: true }), snap(500, { combo: true }), snap(800)]);
    expect(events).toEqual(["start", "stop"]);
    expect(state.phase).toBe("idle");
  });

  it("locks into hands-free mode after a quick tap", () => {
    const { events, state } = run([snap(0, { combo: true }), snap(TAP_MAX_MS - 50)]);
    expect(events).toEqual(["start", "lock"]);
    expect(state.phase).toBe("locked");
  });

  it("stops a locked recording on the next combo press and waits for release", () => {
    const locked = run([snap(0, { combo: true }), snap(100)]).state;
    const { events, state } = run([snap(2000), snap(3000, { combo: true }), snap(3100, { combo: true })], locked);
    expect(events).toEqual(["stop"]);
    expect(state.phase).toBe("awaitRelease");
    expect(run([snap(3200)], state).state.phase).toBe("idle");
  });

  it("does not restart while the combo is still held after stopping", () => {
    const locked = run([snap(0, { combo: true }), snap(100)]).state;
    const { events } = run([snap(1000, { combo: true }), snap(1500, { combo: true }), snap(1600), snap(1700, { combo: true })], locked);
    expect(events).toEqual(["stop", "start"]);
  });

  it("cancels when Escape is pressed while holding", () => {
    const { events, state } = run([snap(0, { combo: true }), snap(400, { combo: true, escape: true }), snap(500)]);
    expect(events).toEqual(["start", "cancel"]);
    expect(state.phase).toBe("idle");
  });

  it("cancels when Escape is pressed in hands-free mode", () => {
    const locked = run([snap(0, { combo: true }), snap(100)]).state;
    const { events, state } = run([snap(900, { escape: true })], locked);
    expect(events).toEqual(["cancel"]);
    expect(state.phase).toBe("idle");
  });

  it("cancels quietly when another key joins the combo (a regular shortcut like Ctrl+Win+D)", () => {
    const { events } = run([snap(0, { combo: true }), snap(50, { combo: true, otherKey: true }), snap(80)]);
    expect(events).toEqual(["start", "cancel"]);
  });

  it("ignores other keys typed while hands-free is locked", () => {
    const locked = run([snap(0, { combo: true }), snap(100)]).state;
    const { events, state } = run([snap(500, { otherKey: true })], locked);
    expect(events).toEqual([]);
    expect(state.phase).toBe("locked");
  });

  it("emits nothing while idle and the combo is up", () => {
    expect(run([snap(0), snap(10, { otherKey: true }), snap(20, { escape: true })]).events).toEqual([]);
  });

  it("does not mutate the previous state", () => {
    const before = initialHotkeyState();
    const frozen = Object.freeze({ ...before });
    stepHotkey(frozen, snap(0, { combo: true }));
    expect(frozen.phase).toBe("idle");
  });
});
