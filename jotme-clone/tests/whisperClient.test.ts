import { describe, expect, it, vi } from "vitest";
import { buildPrompt, transcribe, WhisperError } from "../src/core/whisperClient";

const okResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("buildPrompt & transcribe", () => {
  it("builds prompt with vocabulary", () => {
    expect(buildPrompt(["Previplan", "OKR"])).toContain("Previplan, OKR");
    expect(buildPrompt([])).not.toContain("Vocabulário");
  });

  it("posts WAV and options", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      expect(form.get("audio_ctx")).toBe("768");
      return okResponse({ text: " Olá reunião\n" });
    });

    const text = await transcribe("http://127.0.0.1:1", Buffer.from("RIFF"), { language: "pt", prompt: "p", audioCtx: 768 }, fetchImpl);
    expect(text).toBe(" Olá reunião\n");
  });

  it("handles errors and timeouts", async () => {
    await expect(transcribe("http://x", Buffer.alloc(4), { language: "pt" }, async () => okResponse({}, 500))).rejects.toThrow(WhisperError);
    await expect(transcribe("http://x", Buffer.alloc(4), { language: "pt" }, async () => okResponse({ error: "bad" }))).rejects.toThrow("bad");
    await expect(transcribe("http://x", Buffer.alloc(4), { language: "pt" }, async () => okResponse({}))).rejects.toThrow(WhisperError);
    await expect(
      transcribe("http://x", Buffer.alloc(4), { language: "pt", timeoutMs: 10 }, async () => {
        throw new DOMException("timeout", "TimeoutError");
      }),
    ).rejects.toThrow(/demorou demais/);
  });
});
