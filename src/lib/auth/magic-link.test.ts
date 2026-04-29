import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Mock ioredis
// ---------------------------------------------------------------------------
const mockSet = vi.fn().mockResolvedValue("OK");
const mockGet = vi.fn().mockResolvedValue(null);
const mockDel = vi.fn().mockResolvedValue(1);
const mockQuit = vi.fn().mockResolvedValue("OK");

vi.mock("ioredis", () => {
  function MockRedis() {
    return { set: mockSet, get: mockGet, del: mockDel, quit: mockQuit };
  }
  return { default: MockRedis };
});

import {
  hashToken,
  generateMagicLinkToken,
  verifyMagicLinkToken,
} from "./magic-link";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hashToken", () => {
  it("returns a SHA-256 hex digest", () => {
    const hash = hashToken("test-token");
    // SHA-256 hex is 64 characters
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces the same hash for the same input", () => {
    const h1 = hashToken("same-input");
    const h2 = hashToken("same-input");
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different inputs", () => {
    const h1 = hashToken("input-a");
    const h2 = hashToken("input-b");
    expect(h1).not.toBe(h2);
  });

  it("matches Node.js crypto SHA-256 directly", () => {
    const input = "verify-me";
    const expected = createHash("sha256").update(input).digest("hex");
    expect(hashToken(input)).toBe(expected);
  });
});

describe("generateMagicLinkToken", () => {
  it("returns a 64-character hex token (32 bytes)", async () => {
    const token = await generateMagicLinkToken("+14155551234", "redis://localhost:6379");
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores the token HASH (not raw token) in Redis with 15-min TTL", async () => {
    const token = await generateMagicLinkToken("+14155551234", "redis://localhost:6379");

    expect(mockSet).toHaveBeenCalledOnce();
    const [key, value, ex, ttl] = mockSet.mock.calls[0] as [string, string, string, number];

    // Key should contain the hash, not the raw token
    const expectedHash = hashToken(token);
    expect(key).toBe(`magic_link:${expectedHash}`);
    expect(value).toBe("+14155551234");
    expect(ex).toBe("EX");
    expect(ttl).toBe(15 * 60);
  });

  it("generates unique tokens for each call", async () => {
    const t1 = await generateMagicLinkToken("+14155551234", "redis://localhost:6379");
    const t2 = await generateMagicLinkToken("+14155551234", "redis://localhost:6379");
    expect(t1).not.toBe(t2);
  });

  it("always calls redis.quit", async () => {
    await generateMagicLinkToken("+14155551234", "redis://localhost:6379");
    expect(mockQuit).toHaveBeenCalledOnce();
  });
});

describe("verifyMagicLinkToken", () => {
  it("returns phone number when token hash exists in Redis", async () => {
    const rawToken = "abc123def456";
    const expectedHash = hashToken(rawToken);

    mockGet.mockImplementation((key: string) => {
      if (key === `magic_link:${expectedHash}`) {
        return Promise.resolve("+14155551234");
      }
      return Promise.resolve(null);
    });

    const phone = await verifyMagicLinkToken(rawToken, "redis://localhost:6379");

    expect(phone).toBe("+14155551234");
    expect(mockGet).toHaveBeenCalledWith(`magic_link:${expectedHash}`);
  });

  it("deletes the token after successful verification (single-use)", async () => {
    const rawToken = "single-use-token";
    const expectedHash = hashToken(rawToken);

    mockGet.mockResolvedValueOnce("+14155551234");

    await verifyMagicLinkToken(rawToken, "redis://localhost:6379");

    expect(mockDel).toHaveBeenCalledWith(`magic_link:${expectedHash}`);
  });

  it("returns null when token hash is not found (expired or invalid)", async () => {
    mockGet.mockResolvedValueOnce(null);

    const phone = await verifyMagicLinkToken("bad-token", "redis://localhost:6379");

    expect(phone).toBeNull();
  });

  it("does NOT delete the key when token is not found", async () => {
    mockGet.mockResolvedValueOnce(null);

    await verifyMagicLinkToken("missing-token", "redis://localhost:6379");

    expect(mockDel).not.toHaveBeenCalled();
  });

  it("always calls redis.quit", async () => {
    await verifyMagicLinkToken("any-token", "redis://localhost:6379");
    expect(mockQuit).toHaveBeenCalledOnce();
  });
});
