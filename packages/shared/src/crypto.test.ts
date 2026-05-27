import { beforeAll, describe, expect, it } from "vitest";

const VALID_KEY = Buffer.alloc(32, 0xab).toString("base64");

// Must set MASTER_KEY before importing the crypto module so the lazy init works.
beforeAll(() => {
  process.env.MASTER_KEY = VALID_KEY;
});

// Dynamic import after env is set — this is the module under test.
async function getCrypto() {
  const { encrypt, decrypt, CryptoError, _resetKeyCache } = await import("./crypto");
  return { encrypt, decrypt, CryptoError, _resetKeyCache };
}

describe("encrypt / decrypt", () => {
  it("round-trips plaintext", async () => {
    const { encrypt, decrypt } = await getCrypto();
    const plaintext = "super secret value 🔑";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("produces a different ciphertext on each call (random IV)", async () => {
    const { encrypt } = await getCrypto();
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).not.toBe(b);
  });

  it("throws CryptoError(auth_failed) for tampered ciphertext", async () => {
    const { encrypt, decrypt, CryptoError } = await getCrypto();
    const ciphertext = encrypt("hello");
    const parts = ciphertext.split(":");
    // Flip the last byte of the ciphertext segment
    const ctBuf = Buffer.from(parts[2]!, "base64");
    ctBuf[0] = ctBuf[0]! ^ 0xff;
    parts[2] = ctBuf.toString("base64");
    const tampered = parts.join(":");
    expect(() => decrypt(tampered)).toThrow(CryptoError);
    try {
      decrypt(tampered);
    } catch (e) {
      expect(e).toBeInstanceOf(CryptoError);
      expect((e as InstanceType<typeof CryptoError>).kind).toBe("auth_failed");
    }
  });

  it("throws CryptoError(auth_failed) when decrypting with a different key", async () => {
    const { encrypt, decrypt, CryptoError, _resetKeyCache } = await getCrypto();
    const ciphertext = encrypt("secret");

    // Switch to a different key
    const otherKey = Buffer.alloc(32, 0x11).toString("base64");
    _resetKeyCache();
    process.env.MASTER_KEY = otherKey;

    try {
      expect(() => decrypt(ciphertext)).toThrow(CryptoError);
      try {
        decrypt(ciphertext);
      } catch (e) {
        expect((e as InstanceType<typeof CryptoError>).kind).toBe("auth_failed");
      }
    } finally {
      // Restore the valid key for subsequent tests
      _resetKeyCache();
      process.env.MASTER_KEY = VALID_KEY;
    }
  });

  it("throws CryptoError(bad_format) for a non-colon-delimited string", async () => {
    const { decrypt, CryptoError } = await getCrypto();
    expect(() => decrypt("notvalid")).toThrow(CryptoError);
    try {
      decrypt("notvalid");
    } catch (e) {
      expect((e as InstanceType<typeof CryptoError>).kind).toBe("bad_format");
    }
  });

  it("throws CryptoError(bad_format) for ciphertext with wrong-length IV or tag", async () => {
    const { decrypt, CryptoError } = await getCrypto();
    // Segments decode fine but produce wrong-length IV (5 bytes) and tag (5 bytes).
    // Node.js Buffer.from silently handles bad base64, so we validate lengths explicitly.
    const bad = "aGVsbG8=:aGVsbG8=:aGVsbG8="; // "hello":"hello":"hello" — 5/5/5 bytes
    expect(() => decrypt(bad)).toThrow(CryptoError);
    try {
      decrypt(bad);
    } catch (e) {
      expect((e as InstanceType<typeof CryptoError>).kind).toBe("bad_format");
    }
  });

  it("throws when MASTER_KEY decodes to the wrong length", async () => {
    const { encrypt, _resetKeyCache } = await getCrypto();
    _resetKeyCache();
    process.env.MASTER_KEY = Buffer.alloc(16).toString("base64"); // 16 bytes, not 32
    try {
      expect(() => encrypt("test")).toThrow(/32 bytes/);
    } finally {
      _resetKeyCache();
      process.env.MASTER_KEY = VALID_KEY;
    }
  });
});
