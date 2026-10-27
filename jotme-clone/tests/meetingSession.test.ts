import { describe, expect, it, vi } from "vitest";
import { MeetingSessionController, type MeetingSessionDeps } from "../src/core/meetingSession";

const SPEECH = new Float32Array(16000).fill(0.1);

function makeDeps(overrides: Partial<MeetingSessionDeps> = {}) {
  let clock = 10_000;
  let idCounter = 1;
  const deps: MeetingSessionDeps = {
    recorder: {
      start: vi.fn(async () => {}),
      pause: vi.fn(async () => {}),
      resume: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    },
    transcribe: vi.fn(async () => " Amanhã eu vou fazer o deploy da nova feature.\n"),
    saveMeeting: vi.fn((r) => r),
    getDictionary: () => [{ from: "feature", to: "Feature" }],
    getCaptureMode: () => "both",
    onStateChange: vi.fn(),
    now: () => (clock += 500),
    newId: () => `id-${idCounter++}`,
    sampleRate: 16000,
    log: vi.fn(),
    ...overrides,
  };
  return { deps };
}

describe("MeetingSessionController", () => {
  it("runs a full dual-channel meeting lifecycle: start → segments (you & them) → pause/resume → stop & save Ata", async () => {
    const { deps } = makeDeps();
    const ctrl = new MeetingSessionController(deps);

    const started = await ctrl.start("Reunião de Arquitetura");
    expect(started.status).toBe("recording");
    expect(started.title).toBe("Reunião de Arquitetura");
    expect(deps.recorder.start).toHaveBeenCalledWith("both");

    await ctrl.pushSegment("you", SPEECH);
    await ctrl.pushSegment("them", SPEECH);

    ctrl.setNotes("Validar deploy na sexta.");
    ctrl.setTitle("Reunião de Arquitetura v2");

    await ctrl.pause();
    expect(ctrl.getSnapshot().status).toBe("paused");
    expect(deps.recorder.pause).toHaveBeenCalledOnce();

    await ctrl.resume();
    expect(ctrl.getSnapshot().status).toBe("recording");
    expect(deps.recorder.resume).toHaveBeenCalledOnce();

    const record = await ctrl.stop();
    expect(record).not.toBeNull();
    expect(record?.title).toBe("Reunião de Arquitetura v2");
    expect(record?.notes).toBe("Validar deploy na sexta.");
    expect(record?.turns).toHaveLength(2);
    expect(record?.turns[0].speaker).toBe("you");
    expect(record?.turns[0].text).toContain("Feature");
    expect(record?.turns[1].speaker).toBe("them");
    expect(record?.summary.actionItems.length).toBeGreaterThan(0);
    expect(ctrl.getSnapshot().status).toBe("idle");
  });

  it("ignores silence segments without calling Whisper", async () => {
    const { deps } = makeDeps();
    const ctrl = new MeetingSessionController(deps);
    await ctrl.start("Teste");
    await ctrl.pushSegment("you", new Float32Array(16000));
    expect(deps.transcribe).not.toHaveBeenCalled();
    await ctrl.stop();
  });

  it("handles recorder start errors gracefully and returns to idle", async () => {
    const { deps } = makeDeps({
      recorder: {
        start: vi.fn(async () => {
          throw new Error("Sem permissão de áudio");
        }),
        pause: vi.fn(async () => {}),
        resume: vi.fn(async () => {}),
        stop: vi.fn(async () => {}),
      },
    });
    const ctrl = new MeetingSessionController(deps);
    const snap = await ctrl.start("Falha");
    expect(snap.status).toBe("idle");
    expect(snap.errorMessage).toContain("Sem permissão de áudio");
  });
});
