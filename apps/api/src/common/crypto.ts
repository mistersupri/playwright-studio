import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";

const KEY = createHash("sha256").update(config.encryptionKey).digest();
const MAGIC = Buffer.from("SBENC2");

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). */
export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptText(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", KEY, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

export function encryptJson(value: unknown): string {
  return encryptText(JSON.stringify(value));
}

export function decryptJson<T>(payload: string): T {
  return JSON.parse(decryptText(payload)) as T;
}

export function encryptBuffer(buf: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const body = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decryptBuffer(buf: Buffer): Buffer {
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) return buf;
  const o = MAGIC.length;
  const decipher = createDecipheriv("aes-256-gcm", KEY, buf.subarray(o, o + 12));
  decipher.setAuthTag(buf.subarray(o + 12, o + 28));
  return Buffer.concat([decipher.update(buf.subarray(o + 28)), decipher.final()]);
}

export const MASK = "••••••••";
