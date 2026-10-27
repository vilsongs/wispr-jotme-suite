import { describe, expect, it, vi } from "vitest";
import { RpcClient } from "../src/core/rpc";

describe("RpcClient", () => {
  it("correlates replies with calls by id", async () => {
    const sent: Array<{ id: number; cmd: string }> = [];
    const rpc = new RpcClient((m) => sent.push(m), 1000);
    const a = rpc.call<string>("a");
    const b = rpc.call<string>("b");
    rpc.handleReply({ id: sent[1].id, ok: true, data: "B" });
    rpc.handleReply({ id: sent[0].id, ok: true, data: "A" });
    await expect(a).resolves.toBe("A");
    await expect(b).resolves.toBe("B");
  });

  it("rejects with the remote error message", async () => {
    const rpc = new RpcClient((m) => queueMicrotask(() => rpc.handleReply({ id: m.id, ok: false, error: "sem microfone" })), 1000);
    await expect(rpc.call("start")).rejects.toThrow("sem microfone");
  });

  it("times out when no reply arrives", async () => {
    vi.useFakeTimers();
    const rpc = new RpcClient(() => {}, 50);
    const p = rpc.call("stop");
    vi.advanceTimersByTime(60);
    await expect(p).rejects.toThrow(/stop/);
    vi.useRealTimers();
  });

  it("ignores unknown or malformed replies", () => {
    const rpc = new RpcClient(() => {}, 50);
    expect(() => rpc.handleReply({ id: 999, ok: true })).not.toThrow();
    expect(() => rpc.handleReply("lixo")).not.toThrow();
  });

  it("rejects pending calls on dispose", async () => {
    const rpc = new RpcClient(() => {}, 1000);
    const p = rpc.call("x");
    rpc.dispose("janela fechada");
    await expect(p).rejects.toThrow("janela fechada");
  });
});
