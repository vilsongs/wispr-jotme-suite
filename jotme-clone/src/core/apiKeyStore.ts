/** Guarda a chave de API cifrada em disco; a cifra é injetada (Electron safeStorage no app, falsa nos testes). */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface KeyCodec {
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

export class ApiKeyStore {
  constructor(
    private readonly file: string,
    private readonly codec: KeyCodec,
  ) {}

  has(): boolean {
    return this.get() !== null;
  }

  get(): string | null {
    if (!existsSync(this.file)) return null;
    try {
      const key = this.codec.decrypt(readFileSync(this.file)).trim();
      return key || null;
    } catch {
      return null;
    }
  }

  /** Salva a chave; um valor vazio apaga a chave guardada. */
  set(key: string): void {
    const clean = key.trim();
    if (!clean) {
      rmSync(this.file, { force: true });
      return;
    }
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, this.codec.encrypt(clean));
    renameSync(tmp, this.file);
  }
}
