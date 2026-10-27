import { describe, expect, it } from "vitest";
import { RpcClient } from "../src/core/rpc";

describe("RpcClient", () => {
  it("resolves replies and rejects on error or dispose", async () => {
    let lastId = 0;
    const client = new RpcClient((req) => {
      lastId = req.id;
    }, 500);

    const p1 = client.call<string>("start", { mode: "both" });
    client.handleReply({ id: lastId, ok: true, data: "ok" });
    expect(await p1).toBe("ok");

    const p2 = client.call("stop");
    client.handleReply({ id: lastId, ok: false, error: "falhou" });
    await expect(p2).rejects.toThrow("falhou");

    const p3 = client.call("pause");
    client.dispose("caiu");
    await expect(p3).rejects.toThrow("caiu");

    client.handleReply(null);
    client.handleReply({ id: 999, ok: true });

    const timeoutClient = new RpcClient(() => {}, 10);
    await expect(timeoutClient.call("start")).rejects.toThrow(/não respondeu/);

    const throwingClient = new RpcClient(() => {
      throw new Error("canal fechado");
    }, 100);
    await expect(throwingClient.call("start")).rejects.toThrow("canal fechado");
  });
});
