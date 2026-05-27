import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class CryptoError extends Error {
  constructor(
    message: string,
    public readonly kind: "bad_format" | "auth_failed"
  ) {
    super(message);
    this.name = "CryptoError";
  }
}

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;
  const raw = process.env.MASTER_KEY;
  if (!raw) throw new Error("MASTER_KEY env var is not set");
  const key = Buffer.from(raw, "base64");
  if (key.byteLength !== 32) {
    throw new Error(
      `MASTER_KEY must decode to exactly 32 bytes (got ${key.byteLength}). ` +
        `Generate one with: openssl rand -base64 32`
    );
  }
  _key = key;
  return _key;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(
    ":"
  );
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new CryptoError(
      "Invalid ciphertext format: expected 3 colon-separated parts",
      "bad_format"
    );
  }
  const [ivB64, tagB64, ctB64] = parts as [string, string, string];
  let iv: Buffer, tag: Buffer, ct: Buffer;
  try {
    iv = Buffer.from(ivB64, "base64");
    tag = Buffer.from(tagB64, "base64");
    ct = Buffer.from(ctB64, "base64");
  } catch {
    throw new CryptoError("Invalid base64 in ciphertext", "bad_format");
  }
  if (iv.byteLength !== 12 || tag.byteLength !== 16) {
    throw new CryptoError("Invalid IV or auth tag length in ciphertext", "bad_format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    throw new CryptoError("Decryption failed — wrong key or tampered data", "auth_failed");
  }
}

/** For test isolation: reset the cached key so a fresh MASTER_KEY is read on next call. */
export function _resetKeyCache(): void {
  _key = null;
}
