/**
 * Insere texto no campo ativo como o Wispr faz: põe o texto na área de
 * transferência, envia Ctrl+V e devolve o conteúdo anterior.
 */

/** Área de transferência abstrata; o snapshot é opaco (texto, HTML, imagem…). */
export interface ClipboardPort<S> {
  /** null quando não foi possível ler: nesse caso nada é restaurado. */
  snapshot(): Promise<S | null>;
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
  restore(snapshot: S): Promise<void>;
}

export interface PasteDeps<S> {
  clipboard: ClipboardPort<S>;
  sendPasteShortcut(): void;
  /** Chamado logo após disparar Ctrl+V, antes da espera de restauração da área de transferência. */
  onPasted?(): void;
  /** true quando Ctrl/Win/Alt/Shift físicos estão soltos (evita virar Win+V). */
  modifiersReleased(): boolean;
  sleep(ms: number): Promise<void>;
  restoreClipboard: boolean;
  restoreDelayMs: number;
  releaseTimeoutMs: number;
}

export type PasteResult = "pasted" | "empty";

const POLL_MS = 15;
const SETTLE_MS = 15;

async function waitForModifierRelease<S>(deps: PasteDeps<S>): Promise<void> {
  let waited = 0;
  while (!deps.modifiersReleased()) {
    if (waited >= deps.releaseTimeoutMs) throw new Error("As teclas modificadoras continuam pressionadas; texto não colado.");
    await deps.sleep(POLL_MS);
    waited += POLL_MS;
  }
}

export async function pasteText<S>(text: string, deps: PasteDeps<S>): Promise<PasteResult> {
  if (!text) return "empty";

  await waitForModifierRelease(deps);

  const previous = await deps.clipboard.snapshot();
  await deps.clipboard.writeText(text);
  await deps.sleep(SETTLE_MS);
  // Se o envio falhar, o texto continua na área de transferência para o usuário colar à mão.
  deps.sendPasteShortcut();
  deps.onPasted?.();
  await deps.sleep(deps.restoreDelayMs);

  // Só restaura se a área de transferência ainda tem o nosso texto:
  // se o usuário copiou algo nesse meio-tempo, não apagamos.
  const stillOurs = (await deps.clipboard.readText()) === text;
  if (deps.restoreClipboard && previous !== null && stillOurs) await deps.clipboard.restore(previous);
  return "pasted";
}
