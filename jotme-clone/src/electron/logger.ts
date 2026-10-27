/** Registro de eventos em arquivo local, com rotação simples quando passa de 2 MB. */

import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";

const MAX_BYTES = 2 * 1024 * 1024;

export type LogFn = (level: "info" | "warn" | "error", message: string, err?: unknown) => void;

export function createLogger(file: string): LogFn {
  try {
    mkdirSync(dirname(file), { recursive: true });
  } catch {
    // ignora falha de diretório
  }

  return (level, message, err) => {
    const detail = err instanceof Error ? ` (${err.message})` : err !== undefined ? ` (${String(err)})` : "";
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}${detail}\n`;
    try {
      try {
        if (statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`);
      } catch {
        // arquivo ainda não existe
      }
      appendFileSync(file, line, "utf8");
    } catch {
      // nunca trava o app por falha de log
    }
  };
}
