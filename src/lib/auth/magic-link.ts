import { randomBytes, createHash } from "node:crypto";
import Redis from "ioredis";

/** Magic link token TTL: 15 minutes in seconds */
const MAGIC_LINK_TTL_SECONDS = 15 * 60;

/** Redis key prefix for magic link token hashes */
const MAGIC_LINK_PREFIX = "magic_link:";

/**
 * Hash a raw token with SHA-256 and return the hex digest.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a magic link token, store its SHA-256 hash in Redis with a 15-minute TTL,
 * and return the raw token (to be sent via SMS — never stored or returned in API responses).
 */
export async function generateMagicLinkToken(
  phoneNumber: string,
  redisUrl: string,
): Promise<string> {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  try {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    // Store: hash → phoneNumber, with 15-minute expiry
    await redis.set(
      `${MAGIC_LINK_PREFIX}${tokenHash}`,
      phoneNumber,
      "EX",
      MAGIC_LINK_TTL_SECONDS,
    );
    return rawToken;
  } finally {
    await redis.quit();
  }
}

/**
 * Verify a magic link token. Hashes the provided raw token, looks up the hash in Redis.
 * If found and not expired, deletes the key (single-use) and returns the phone number.
 * If not found or expired, returns null.
 */
export async function verifyMagicLinkToken(
  rawToken: string,
  redisUrl: string,
): Promise<string | null> {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  try {
    const tokenHash = hashToken(rawToken);
    const key = `${MAGIC_LINK_PREFIX}${tokenHash}`;
    const phoneNumber = await redis.get(key);
    if (!phoneNumber) {
      return null;
    }
    // Single-use: delete after verification
    await redis.del(key);
    return phoneNumber;
  } finally {
    await redis.quit();
  }
}
