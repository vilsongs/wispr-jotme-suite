/**
 * Guarda os prints de tela tirados durante a reunião, em uma pasta por dia.
 * Nunca sobrescreve um print anterior: se o nome já existe, acrescenta -2, -3...
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAX_NAME_ATTEMPTS = 1000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dayFolderName(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** `print-2026-11-06_09-05-07.png` (hora local); `suffix` > 1 vira `-2`, `-3`... */
export function screenshotFileName(at: Date, suffix = 1): string {
  const time = `${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`;
  const tail = suffix > 1 ? `-${suffix}` : "";
  return `print-${dayFolderName(at)}_${time}${tail}.png`;
}

/** Grava o PNG em `<root>/<dia>/` e devolve o caminho completo do arquivo. */
export function saveScreenshot(root: string, png: Buffer, at: Date): string {
  if (png.length === 0) throw new Error("A captura da tela veio vazia.");
  const dir = join(root, dayFolderName(at));
  mkdirSync(dir, { recursive: true });
  for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt += 1) {
    const file = join(dir, screenshotFileName(at, attempt));
    if (!existsSync(file)) {
      writeFileSync(file, png, { flag: "wx" });
      return file;
    }
  }
  throw new Error("Não foi possível escolher um nome livre para o print.");
}
