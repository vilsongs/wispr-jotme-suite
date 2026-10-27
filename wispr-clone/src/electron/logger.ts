/** Log simples em arquivo (userData/logs/wispr-clone.log), com rotação por tamanho. */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";

export type LogLevel = "info" | "warn" | "error";
export type Logger = (level: LogLevel, message: string, err?: unknown) => void;

const MAX_BYTES = 2 * 1024 * 1024;

const describe = (err: unknown): string => {
  if (err instanceof Error) return `${err.name}: ${err.message}${err.cause ? ` (causa: ${describe(err.cause)})` : ""}`;
  return err === undefined ? "" : String(err);
};

export function createLogger(file: string): Logger {
  mkdirSync(dirname(file), { recursive: true });
  return (level, message, err) => {
    try {
      if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`);
      const extra = err === undefined ? "" : ` | ${describe(err)}`;
      appendFileSync(file, `${new Date().toISOString()} [${level.toUpperCase()}] ${message}${extra}\n`, "utf8");
    } catch {
      // log nunca pode derrubar o app
    }
  };
}
