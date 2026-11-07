import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiKeyStore, type KeyCodec } from "../src/core/apiKeyStore";

const codec: KeyCodec = {
  encrypt: (plain) => Buffer.from(plain.split("").reverse().join(""), "utf8"),
  decrypt: (data) => data.toString("utf8").split("").reverse().join(""),
};

describe("ApiKeyStore", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jotme-key-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("starts empty", () => {
    const store = new ApiKeyStore(join(dir, "k.bin"), codec);
    expect(store.has()).toBe(false);
    expect(store.get()).toBeNull();
  });

  it("stores the key encrypted on disk and reads it back", () => {
    const file = join(dir, "k.bin");
    const store = new ApiKeyStore(file, codec);
    store.set("  sk-ant-abc123  ");
    expect(store.has()).toBe(true);
    expect(store.get()).toBe("sk-ant-abc123");
    expect(readFileSync(file).toString("utf8")).not.toContain("sk-ant-abc123");
    expect(new ApiKeyStore(file, codec).get()).toBe("sk-ant-abc123");
  });

  it("clears the key when an empty value is saved", () => {
    const store = new ApiKeyStore(join(dir, "k.bin"), codec);
    store.set("abc");
    store.set("   ");
    expect(store.has()).toBe(false);
    expect(store.get()).toBeNull();
  });

  it("returns null when the stored file cannot be decrypted", () => {
    const file = join(dir, "k.bin");
    new ApiKeyStore(file, codec).set("abc");
    const broken: KeyCodec = {
      encrypt: codec.encrypt,
      decrypt: () => {
        throw new Error("corrompido");
      },
    };
    expect(new ApiKeyStore(file, broken).get()).toBeNull();
  });
});
