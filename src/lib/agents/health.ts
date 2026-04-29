import type Redis from "ioredis";
import type { AgentType } from "@/types/agents";
import type { AgentHealthReport } from "@/types/conductor";
import { CHANNELS, publishEvent } from "./pubsub";

/** Health ping interval in milliseconds (10 seconds) */
export const HEALTH_PING_INTERVAL_MS = 10_000;

/** Number of missed pings before conductor is considered down */
const MISSED_PING_THRESHOLD = 3;

/** Redis key prefix for storing last ping timestamps */
const HEALTH_KEY_PREFIX = "agent:health:last-ping:";

/** All agent types for health iteration */
const ALL_AGENTS: readonly AgentType[] = [
  "conductor",
  "watcher",
  "fixer",
  "hunter",
  "voice",
] as const;

/**
 * Sends a health ping for the given agent type.
 * Stores the timestamp in Redis and publishes on the health channel.
 */
export async function sendHealthPing(
  agentType: AgentType,
  redisClient: Redis,
): Promise<void> {
  const now = new Date().toISOString();
  const key = `${HEALTH_KEY_PREFIX}${agentType}`;

  await redisClient.set(key, now, "EX", 60);

  await publishEvent(
    CHANNELS.HEALTH,
    { agent: agentType, pingAt: now },
    redisClient,
  );
}

/**
 * Checks health of all agents by reading their last ping timestamps
 * from Redis. Returns an AgentHealthReport with missed ping counts
 * and conductor failover detection.
 */
export async function checkAgentHealth(
  redisClient: Redis,
): Promise<AgentHealthReport> {
  const now = Date.now();
  const agents = {} as Record<
    AgentType,
    { lastPingAt: string; isHealthy: boolean; missedPings: number }
  >;

  for (const agent of ALL_AGENTS) {
    const key = `${HEALTH_KEY_PREFIX}${agent}`;
    const lastPing = await redisClient.get(key);

    if (lastPing) {
      const elapsed = now - new Date(lastPing).getTime();
      const missedPings = Math.floor(elapsed / HEALTH_PING_INTERVAL_MS);
      agents[agent] = {
        lastPingAt: lastPing,
        isHealthy: missedPings < MISSED_PING_THRESHOLD,
        missedPings,
      };
    } else {
      agents[agent] = {
        lastPingAt: "",
        isHealthy: false,
        missedPings: MISSED_PING_THRESHOLD,
      };
    }
  }

  const conductorStatus = agents.conductor;
  const conductorHealthy = conductorStatus?.isHealthy ?? false;
  const autonomousModeActive = !conductorHealthy;

  return {
    agents,
    conductorHealthy,
    autonomousModeActive,
  };
}

/**
 * Starts periodic health pings for an agent. Returns a cleanup
 * function to stop the interval.
 */
export function startHealthPingLoop(
  agentType: AgentType,
  redisClient: Redis,
): { stop: () => void } {
  const interval = setInterval(() => {
    void sendHealthPing(agentType, redisClient);
  }, HEALTH_PING_INTERVAL_MS);

  // Send an initial ping immediately
  void sendHealthPing(agentType, redisClient);

  return {
    stop: () => clearInterval(interval),
  };
}
