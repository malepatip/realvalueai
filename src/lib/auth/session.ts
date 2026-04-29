import { randomUUID } from "node:crypto";
import Redis from "ioredis";

/** Session TTL: 7 days in seconds */
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Redis key prefix for sessions */
const SESSION_PREFIX = "session:";

/**
 * Create a new session for the given user.
 * Stores the userId in Redis keyed by a random session token with a 7-day TTL.
 * Returns the session token (a UUID).
 */
export async function createSession(
  userId: string,
  redisUrl: string,
): Promise<string> {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  try {
    const sessionToken = randomUUID();
    await redis.set(
      `${SESSION_PREFIX}${sessionToken}`,
      userId,
      "EX",
      SESSION_TTL_SECONDS,
    );
    return sessionToken;
  } finally {
    await redis.quit();
  }
}

/**
 * Validate a session token. Returns the userId if the session is valid, or null.
 */
export async function validateSession(
  sessionToken: string,
  redisUrl: string,
): Promise<string | null> {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  try {
    const userId = await redis.get(`${SESSION_PREFIX}${sessionToken}`);
    return userId;
  } finally {
    await redis.quit();
  }
}

/**
 * Destroy a session by deleting its key from Redis.
 */
export async function destroySession(
  sessionToken: string,
  redisUrl: string,
): Promise<void> {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  try {
    await redis.del(`${SESSION_PREFIX}${sessionToken}`);
  } finally {
    await redis.quit();
  }
}
