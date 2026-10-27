/** Pedido/resposta sobre um canal de mão única (IPC do Electron), com timeout. */

export interface RpcRequest {
  id: number;
  cmd: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RpcClient {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(
    private readonly send: (req: RpcRequest) => void,
    private readonly timeoutMs: number,
  ) {}

  call<T = unknown>(cmd: string): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Sem resposta para "${cmd}" em ${this.timeoutMs} ms.`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.send({ id, cmd });
    });
  }

  handleReply(reply: unknown): void {
    if (typeof reply !== "object" || reply === null) return;
    const { id, ok, data, error } = reply as { id?: unknown; ok?: unknown; data?: unknown; error?: unknown };
    if (typeof id !== "number") return;
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    clearTimeout(p.timer);
    if (ok === true) p.resolve(data);
    else p.reject(new Error(typeof error === "string" ? error : "Erro desconhecido."));
  }

  dispose(reason: string): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
      this.pending.delete(id);
    }
  }
}
