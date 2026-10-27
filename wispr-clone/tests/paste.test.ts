import { describe, expect, it, vi } from "vitest";
import { pasteText, type ClipboardPort, type PasteDeps } from "../src/core/paste";

interface Snap {
  text: string;
  html?: string;
}

function fakeClipboard(initial: Snap) {
  const state = { current: { ...initial } as Snap };
  const port: ClipboardPort<Snap> = {
    snapshot: vi.fn(async () => ({ ...state.current })),
    writeText: vi.fn(async (text: string) => {
      state.current = { text };
    }),
    restore: vi.fn(async (data: Snap) => {
      state.current = { ...data };
    }),
    readText: vi.fn(async () => state.current.text),
  };
  return { port, state };
}

function deps(overrides: Partial<PasteDeps<Snap>> = {}, clip = fakeClipboard({ text: "antigo", html: "<b>antigo</b>" })) {
  const base: PasteDeps<Snap> = {
    clipboard: clip.port,
    sendPasteShortcut: vi.fn(),
    modifiersReleased: vi.fn(() => true),
    sleep: vi.fn(async () => {}),
    restoreClipboard: true,
    restoreDelayMs: 200,
    releaseTimeoutMs: 1000,
  };
  return { d: { ...base, ...overrides }, clip };
}

describe("pasteText", () => {
  it("writes the text, sends Ctrl+V and restores the previous clipboard", async () => {
    const onPasted = vi.fn();
    const { d, clip } = deps({ onPasted });
    const result = await pasteText("novo texto", d);
    expect(result).toBe("pasted");
    expect(clip.port.writeText).toHaveBeenCalledWith("novo texto");
    expect(d.sendPasteShortcut).toHaveBeenCalledOnce();
    expect(onPasted).toHaveBeenCalledOnce();
    expect(clip.state.current).toEqual({ text: "antigo", html: "<b>antigo</b>" });
  });

  it("takes the snapshot before overwriting the clipboard", async () => {
    const { d, clip } = deps();
    await pasteText("x", d);
    const snapOrder = (clip.port.snapshot as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const writeOrder = (clip.port.writeText as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(snapOrder).toBeLessThan(writeOrder);
  });

  it("does nothing for empty text", async () => {
    const { d, clip } = deps();
    expect(await pasteText("", d)).toBe("empty");
    expect(clip.port.writeText).not.toHaveBeenCalled();
    expect(d.sendPasteShortcut).not.toHaveBeenCalled();
  });

  it("waits until the user releases the modifier keys before pasting", async () => {
    const released = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true);
    const { d } = deps({ modifiersReleased: released });
    await pasteText("x", d);
    expect(released).toHaveBeenCalledTimes(3);
  });

  it("gives up with an error if the modifiers stay pressed", async () => {
    const { d, clip } = deps({ modifiersReleased: () => false, releaseTimeoutMs: 30 });
    await expect(pasteText("x", d)).rejects.toThrow(/teclas/);
    expect(clip.port.writeText).not.toHaveBeenCalled();
  });

  it("keeps the dictated text on the clipboard when restore is disabled", async () => {
    const { d, clip } = deps({ restoreClipboard: false });
    await pasteText("fica", d);
    expect(clip.port.restore).not.toHaveBeenCalled();
    expect(clip.state.current.text).toBe("fica");
  });

  it("does not clobber something the user copied in the meantime", async () => {
    const clip = fakeClipboard({ text: "antigo" });
    const { d } = deps(
      {
        sendPasteShortcut: vi.fn(() => {
          clip.state.current = { text: "copiado agora pelo usuário" };
        }),
      },
      clip,
    );
    await pasteText("ditado", d);
    expect(clip.port.restore).not.toHaveBeenCalled();
    expect(clip.state.current.text).toBe("copiado agora pelo usuário");
  });

  it("leaves the dictated text on the clipboard if sending the shortcut fails, so the user can paste it", async () => {
    const { d, clip } = deps({
      sendPasteShortcut: vi.fn(() => {
        throw new Error("SendInput falhou");
      }),
    });
    await expect(pasteText("ditado", d)).rejects.toThrow("SendInput falhou");
    expect(clip.port.restore).not.toHaveBeenCalled();
    expect(clip.state.current.text).toBe("ditado");
  });

  it("skips restoring when the snapshot could not be taken (null)", async () => {
    const clip = fakeClipboard({ text: "antigo" });
    clip.port.snapshot = vi.fn(async () => null as unknown as Snap);
    const { d } = deps({}, clip);
    await pasteText("novo", d);
    expect(clip.port.restore).not.toHaveBeenCalled();
  });
});
