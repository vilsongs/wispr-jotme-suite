import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveScreenshot, screenshotFileName } from "../src/core/screenshotStore";

describe("screenshotFileName", () => {
  it("uses the local date and time down to the second, plus a numeric suffix when asked", () => {
    const at = new Date(2026, 10, 6, 9, 5, 7); // 06/11/2026 09:05:07 (hora local)
    expect(screenshotFileName(at)).toBe("print-2026-11-06_09-05-07.png");
    expect(screenshotFileName(at, 2)).toBe("print-2026-11-06_09-05-07-2.png");
  });
});

describe("saveScreenshot", () => {
  let root = "";
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "jotme-prints-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const at = new Date(2026, 10, 6, 9, 5, 7);

  it("creates the folder of the day and writes the image bytes", () => {
    const file = saveScreenshot(root, png, at);
    expect(existsSync(file)).toBe(true);
    expect(dirname(file)).toBe(join(root, "2026-11-06"));
    expect(basename(file)).toBe("print-2026-11-06_09-05-07.png");
    expect(readFileSync(file).equals(png)).toBe(true);
  });

  it("never overwrites an earlier print taken in the same second", () => {
    const first = saveScreenshot(root, png, at);
    const second = saveScreenshot(root, Buffer.from([9, 9]), at);
    expect(second).not.toBe(first);
    expect(readFileSync(first).equals(png)).toBe(true);
    expect(basename(second)).toBe("print-2026-11-06_09-05-07-2.png");
  });

  it("refuses an empty image instead of saving a blank file", () => {
    expect(() => saveScreenshot(root, Buffer.alloc(0), at)).toThrow(/vazia|vazio/i);
  });
});
