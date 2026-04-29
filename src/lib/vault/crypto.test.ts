import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { deriveKey, encrypt, decrypt, zeroMemory } from "./crypto";

describe("deriveKey", () => {
  it("produces a 32-byte key", async () => {
    const salt = randomBytes(32);
    const key = await deriveKey("123456", salt);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("produces different keys for different salts", async () => {
    const pin = "123456";
    const salt1 = randomBytes(32);
    const salt2 = randomBytes(32);
    const key1 = await deriveKey(pin, salt1);
    const key2 = await deriveKey(pin, salt2);
    expect(key1.equals(key2)).toBe(false);
  });

  it("produces the same key for the same pin + salt", async () => {
    const pin = "654321";
    const salt = randomBytes(32);
    const key1 = await deriveKey(pin, salt);
    const key2 = await deriveKey(pin, salt);
    expect(key1.equals(key2)).toBe(true);
  });

  it("produces different keys for different PINs with same salt", async () => {
    const salt = randomBytes(32);
    const key1 = await deriveKey("111111", salt);
    const key2 = await deriveKey("222222", salt);
    expect(key1.equals(key2)).toBe(false);
  });
});


describe("encrypt / decrypt round-trip", () => {
  it("decrypts to the original plaintext", async () => {
    const plaintext = "my-secret-password-123!";
    const pin = "123456";
    const encrypted = await encrypt(plaintext, pin);
    const decrypted = await decrypt(encrypted, pin);
    expect(decrypted).toBe(plaintext);
  });

  it("handles empty string plaintext", async () => {
    const encrypted = await encrypt("", "000000");
    const decrypted = await decrypt(encrypted, "000000");
    expect(decrypted).toBe("");
  });

  it("handles unicode plaintext", async () => {
    const plaintext = "pässwörd-日本語-🔐";
    const encrypted = await encrypt(plaintext, "999999");
    const decrypted = await decrypt(encrypted, "999999");
    expect(decrypted).toBe(plaintext);
  });

  it("returns EncryptedData with all required fields", async () => {
    const encrypted = await encrypt("test", "123456");
    expect(encrypted.encryptedBlob).toBeInstanceOf(Buffer);
    expect(encrypted.salt).toBeInstanceOf(Buffer);
    expect(encrypted.iv).toBeInstanceOf(Buffer);
    expect(encrypted.authTag).toBeInstanceOf(Buffer);
    expect(encrypted.salt.length).toBe(32);
    expect(encrypted.iv.length).toBe(12);
    expect(encrypted.authTag.length).toBe(16);
  });

  it("produces different ciphertexts for the same plaintext and PIN", async () => {
    const plaintext = "same-credential";
    const pin = "123456";
    const enc1 = await encrypt(plaintext, pin);
    const enc2 = await encrypt(plaintext, pin);
    // Different random salt + IV each time
    expect(enc1.encryptedBlob.equals(enc2.encryptedBlob)).toBe(false);
    expect(enc1.salt.equals(enc2.salt)).toBe(false);
    expect(enc1.iv.equals(enc2.iv)).toBe(false);
  });
});

describe("decrypt with wrong PIN", () => {
  it("throws on wrong PIN (GCM auth tag mismatch)", async () => {
    const encrypted = await encrypt("secret-data", "123456");
    await expect(decrypt(encrypted, "654321")).rejects.toThrow();
  });
});

describe("zeroMemory", () => {
  it("overwrites buffer contents with zeros", () => {
    const buf = Buffer.from([0xff, 0xab, 0xcd, 0xef, 0x12, 0x34]);
    zeroMemory(buf);
    for (let i = 0; i < buf.length; i++) {
      expect(buf[i]).toBe(0);
    }
  });

  it("works on an already-zero buffer", () => {
    const buf = Buffer.alloc(16, 0);
    zeroMemory(buf);
    for (let i = 0; i < buf.length; i++) {
      expect(buf[i]).toBe(0);
    }
  });
});
