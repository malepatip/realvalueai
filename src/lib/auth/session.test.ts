import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock ioredis — must be set up before importing the module under test
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

import { createSession, validateSession, destroySession } from "./session";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createSession", () => {
  it("stores a session in Redis with 7-day TTL and returns a UUID token", async () => {
    const token = await createSession("user-123", "redis://localhost:6379");

    // Token should be a valid UUID v4
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    // Redis SET called with correct key, value, and TTL
    expect(mockSet).toHaveBeenCalledOnce();
    const [key, value, ex, ttl] = mockSet.mock.calls[0] as [string, string, string, number];
    expect(key).toBe(`session:${token}`);
    expect(value).toBe("user-123");
    expect(ex).toBe("EX");
    expect(ttl).toBe(7 * 24 * 60 * 60);
  });

  it("generates unique tokens for each call", async () => {
    const t1 = await createSession("user-1", "redis://localhost:6379");
    const t2 = await createSession("user-2", "redis://localhost:6379");
    expect(t1).not.toBe(t2);
  });

  it("always calls redis.quit in the finally block", async () => {
    await createSession("user-1", "redis://localhost:6379");
    expect(mockQuit).toHaveBeenCalledOnce();
  });
});

describe("validateSession", () => {
  it("returns userId when session exists in Redis", async () => {
    mockGet.mockResolvedValueOnce("user-456");

    const userId = await validateSession("some-token", "redis://localhost:6379");

    expect(userId).toBe("user-456");
    expect(mockGet).toHaveBeenCalledWith("session:some-token");
  });

  it("returns null when session does not exist", async () => {
    mockGet.mockResolvedValueOnce(null);

    const userId = await validateSession("expired-token", "redis://localhost:6379");

    expect(userId).toBeNull();
  });

  it("always calls redis.quit in the finally block", async () => {
    await validateSession("any-token", "redis://localhost:6379");
    expect(mockQuit).toHaveBeenCalledOnce();
  });
});

describe("destroySession", () => {
  it("deletes the session key from Redis", async () => {
    await destroySession("token-to-delete", "redis://localhost:6379");

    expect(mockDel).toHaveBeenCalledWith("session:token-to-delete");
  });

  it("always calls redis.quit in the finally block", async () => {
    await destroySession("any-token", "redis://localhost:6379");
    expect(mockQuit).toHaveBeenCalledOnce();
  });
});
