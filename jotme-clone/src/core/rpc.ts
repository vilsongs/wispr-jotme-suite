/**
 * RPC leve sobre mensagens unidirecionais (como o IPC do Electron entre o
 * processo principal e a janela oculta de captura de áudio).
 */

export interface RpcRequest<C = string> {
  id: number;
  cmd: C;
  payload?: unknown;
}

export interface RpcReply<T = unknown> {
  id: number;
  ok: boolean;
  data?: T;
  error?: string;
}

interface Pending {
  resolve(value: unknown): void;
  reject(reason: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

const isReply = (v: unknown): v is RpcReply =>
  typeof v === "object" && v !== null && typeof (v as RpcReply).id === "number" && typeof (v as RpcReply).ok === "boolean";

export class RpcClient<C extends string = string> {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(
    private readonly send: (req: RpcRequest<C>) => void,
    private readonly timeoutMs: number,
  ) {}

  call<T = void>(cmd: C, payload?: unknown): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Gravador não respondeu ao comando "${cmd}" em ${this.timeoutMs} ms.`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });

      try {
        this.send({ id, cmd, payload });
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  handleReply(raw: unknown): void {
    if (!isReply(raw)) return;
    const entry = this.pending.get(raw.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(raw.id);
    if (raw.ok) entry.resolve(raw.data);
    else entry.reject(new Error(raw.error ?? "Falha no gravador de áudio."));
  }

  dispose(reason: string): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
