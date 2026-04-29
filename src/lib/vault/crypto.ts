/**
 * Credential Vault Encryption Module
 *
 * AES-256-GCM encryption with PBKDF2 key derivation.
 * PIN never stored — only used transiently for key derivation.
 * Never log credentials, PINs, or decrypted data.
 *
 * @module vault/crypto
 */

import { randomBytes, pbkdf2, createCipheriv, createDecipheriv } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);

/** PBKDF2 iteration count — 100,000 per design spec */
const PBKDF2_ITERATIONS = 100_000;
/** PBKDF2 digest algorithm */
const PBKDF2_DIGEST = "sha256";
/** AES-256-GCM key length in bytes */
const KEY_LENGTH = 32;
/** Salt length in bytes */
const SALT_LENGTH = 32;
/** IV length in bytes for AES-GCM */
const IV_LENGTH = 12;
/** AES-GCM auth tag length in bytes */
const AUTH_TAG_LENGTH = 16;

/** Encrypted data envelope returned by encrypt() */
export interface EncryptedData {
  readonly encryptedBlob: Buffer;
  readonly salt: Buffer;
  readonly iv: Buffer;
  readonly authTag: Buffer;
}


/**
 * Derive an AES-256 key from a PIN using PBKDF2.
 *
 * @param pin - User's PIN (never stored)
 * @param salt - Random salt (unique per credential)
 * @returns 32-byte derived key
 */
export async function deriveKey(pin: string, salt: Buffer): Promise<Buffer> {
  return pbkdf2Async(pin, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
}

/**
 * Encrypt plaintext using AES-256-GCM with a PIN-derived key.
 *
 * Generates a random salt and IV per encryption call, ensuring
 * different ciphertexts even for the same plaintext + PIN.
 *
 * @param plaintext - Data to encrypt (credential)
 * @param pin - User's PIN for key derivation
 * @returns EncryptedData envelope with blob, salt, iv, authTag
 */
export async function encrypt(plaintext: string, pin: string): Promise<EncryptedData> {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = await deriveKey(pin, salt);

  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return { encryptedBlob: encrypted, salt, iv, authTag };
  } finally {
    zeroMemory(key);
  }
}

/**
 * Decrypt AES-256-GCM encrypted data using a PIN-derived key.
 *
 * @param data - EncryptedData envelope from encrypt()
 * @param pin - User's PIN for key derivation
 * @returns Decrypted plaintext string
 * @throws Error if PIN is wrong or data has been tampered with (GCM auth tag mismatch)
 */
export async function decrypt(data: EncryptedData, pin: string): Promise<string> {
  const key = await deriveKey(pin, data.salt);

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, data.iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(data.authTag);
    const decrypted = Buffer.concat([decipher.update(data.encryptedBlob), decipher.final()]);
    return decrypted.toString("utf8");
  } finally {
    zeroMemory(key);
  }
}

/**
 * Securely wipe buffer contents by overwriting with zeros.
 *
 * @param buffer - Buffer to zero out
 */
export function zeroMemory(buffer: Buffer): void {
  buffer.fill(0);
}
