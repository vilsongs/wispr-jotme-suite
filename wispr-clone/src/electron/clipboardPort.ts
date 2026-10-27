/** Adaptador da área de transferência do Electron (API assíncrona, estilo W3C) para o núcleo. */

import { clipboard, ClipboardItem } from "electron";
import type { ClipboardPort } from "../core/paste";

/** Cada item salvo como { tipoMIME: conteúdo }, para devolver exatamente o que havia. */
type Snapshot = Array<Record<string, Blob | string>>;

async function readItem(item: ClipboardItem): Promise<Record<string, Blob | string>> {
  const entries = await Promise.all(
    item.types.map(async (type) => {
      try {
        const value = await item.getType(type);
        return value instanceof Blob ? ([type, value] as const) : null;
      } catch {
        return null; // formato que a plataforma lista mas não entrega
      }
    }),
  );
  return Object.fromEntries(entries.filter((e): e is readonly [string, Blob] => e !== null));
}

export function createClipboardPort(onError: (message: string, err: unknown) => void): ClipboardPort<Snapshot> {
  return {
    snapshot: async () => {
      try {
        const items = await clipboard.read();
        return (await Promise.all(items.map(readItem))).filter((r) => Object.keys(r).length > 0);
      } catch (err) {
        onError("Não consegui ler a área de transferência para restaurá-la depois.", err);
        return null; // leitura falhou: melhor não restaurar do que apagar o que havia
      }
    },
    writeText: (text) => clipboard.writeText(text),
    readText: () => clipboard.readText(),
    restore: async (snapshot) => {
      if (snapshot.length === 0) return clipboard.clear();
      await clipboard.write(snapshot.map((record) => new ClipboardItem(record)));
    },
  };
}
