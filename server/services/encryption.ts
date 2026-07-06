import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
// Make sure we have a solid secret. We can use the Firebase API Key as a base to derive the key,
// or a secret environment variable if provided, fallback to a robust secret key.
const DEFAULT_SECRET = "secure-aes-encryption-key-for-playwright-outputs";

function getKey(): Buffer {
  // Use user-configured secret if available, otherwise fallback
  const secret = process.env.ENCRYPTION_SECRET || DEFAULT_SECRET;
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a string value using AES-256-CBC.
 */
export function encrypt(text: string): string {
  if (text === null || text === undefined) return "";
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

/**
 * Decrypts an AES-256-CBC encrypted string.
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return "";
  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 2) {
      // Not in encrypted format, return as-is
      return encryptedText;
    }
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    // Decryption fallback if secret key changed or data is not matching
    return encryptedText; // Fallback to raw on error
  }
}

const BUFFER_MAGIC = Buffer.from("PLAYENC1"); // 8 bytes magic header

/**
 * Encrypts a file buffer.
 */
export function encryptBuffer(buffer: Buffer): Buffer {
  // Check if already encrypted to avoid double encryption
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(BUFFER_MAGIC)) {
    return buffer;
  }
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  // Format: [MAGIC (8 bytes)] [IV (16 bytes)] [Encrypted Data]
  return Buffer.concat([BUFFER_MAGIC, iv, encrypted]);
}

/**
 * Decrypts an encrypted file buffer.
 */
export function decryptBuffer(buffer: Buffer): Buffer {
  try {
    if (buffer.length < 24) {
      return buffer; // Too small to be an encrypted buffer with MAGIC + IV
    }
    const magic = buffer.subarray(0, 8);
    if (!magic.equals(BUFFER_MAGIC)) {
      return buffer; // Not encrypted, return as-is
    }
    const iv = buffer.subarray(8, 24);
    const encrypted = buffer.subarray(24);
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch (error) {
    // Decryption fallback if secret key changed or data is not matching
    return buffer; // Return as-is on error
  }
}
