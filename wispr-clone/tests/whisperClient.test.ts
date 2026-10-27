import { describe, expect, it, vi } from "vitest";
import { buildPrompt, transcribe, WhisperError } from "../src/core/whisperClient";

const okResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("buildPrompt", () => {
  it("uses a mixed PT/EN style prompt and appends the user vocabulary", () => {
    const prompt = buildPrompt(["Vilson", "Power BI"]);
    expect(prompt).toContain("português");
    expect(prompt).toContain("Vilson, Power BI");
  });

  it("omits the vocabulary sentence when there are no words", () => {
    expect(buildPrompt([])).not.toContain("Vocabulário");
  });
});

describe("transcribe", () => {
  it("posts the WAV and options as multipart form data and returns the text", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      expect(form.get("language")).toBe("pt");
      expect(form.get("response_format")).toBe("json");
      expect(form.get("audio_ctx")).toBe("832");
      expect(form.get("prompt")).toBe("dica");
      expect(form.get("file")).toBeInstanceOf(Blob);
      return okResponse({ text: " Olá mundo\n" });
    });

    const text = await transcribe("http://127.0.0.1:1", Buffer.from("RIFF"), { language: "pt", prompt: "dica", audioCtx: 832 }, fetchImpl);

    expect(text).toBe(" Olá mundo\n");
    expect(fetchImpl.mock.calls[0][0]).toBe("http://127.0.0.1:1/inference");
  });

  it("omits optional fields when not provided", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      expect(form.has("prompt")).toBe(false);
      expect(form.has("audio_ctx")).toBe(false);
      return okResponse({ text: "ok" });
    });
    await transcribe("http://x", Buffer.alloc(4), { language: "auto" }, fetchImpl);
  });

  it("throws a WhisperError on HTTP failures", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ error: "boom" }, 500));
    await expect(transcribe("http://x", Buffer.alloc(4), { language: "pt" }, fetchImpl)).rejects.toThrow(WhisperError);
  });

  it("throws a WhisperError when the server reports an error in the body", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ error: "failed to read audio" }));
    await expect(transcribe("http://x", Buffer.alloc(4), { language: "pt" }, fetchImpl)).rejects.toThrow("failed to read audio");
  });

  it("throws a WhisperError when the response has no text field", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ foo: 1 }));
    await expect(transcribe("http://x", Buffer.alloc(4), { language: "pt" }, fetchImpl)).rejects.toThrow(WhisperError);
  });

  it("passes an abort signal and reports a timeout clearly (M5)", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    await expect(transcribe("http://x", Buffer.alloc(4), { language: "pt", timeoutMs: 10 }, fetchImpl)).rejects.toThrow(/demorou demais/);
  });

  it("wraps network errors in a WhisperError", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(transcribe("http://x", Buffer.alloc(4), { language: "pt" }, fetchImpl)).rejects.toThrow(/servidor de transcrição/);
  });
});
