import type Redis from "ioredis";
import { createRedisClient } from "@/lib/redis/client";

/** Standard pub/sub channel names for agent coordination */
export const CHANNELS = {
  HEALTH: "agent:health",
  KILL_SWITCH: "agent:kill-switch",
  PRIORITY_CHANGE: "agent:priority-change",
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];

/** Event payload published on a channel */
export interface PubSubEvent {
  readonly channel: ChannelName;
  readonly timestamp: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Publishes an event to a Redis pub/sub channel.
 * Returns the number of subscribers that received the message.
 */
export async function publishEvent(
  channel: ChannelName,
  event: Record<string, unknown>,
  redisClient: Redis,
): Promise<number> {
  const pubSubEvent: PubSubEvent = {
    channel,
    timestamp: new Date().toISOString(),
    payload: event,
  };
  return redisClient.publish(channel, JSON.stringify(pubSubEvent));
}

/**
 * Subscribes to a Redis pub/sub channel and invokes the handler
 * for each received event. Returns a cleanup function to unsubscribe.
 *
 * Uses a dedicated subscriber connection (Redis requires separate
 * connections for pub/sub subscribers).
 */
export async function subscribeToEvents(
  channel: ChannelName,
  handler: (event: PubSubEvent) => void,
  redisUrl: string,
): Promise<{ unsubscribe: () => Promise<void> }> {
  const subscriber = createRedisClient({ url: redisUrl });

  subscriber.on("message", (receivedChannel: string, message: string) => {
    if (receivedChannel === channel) {
      const parsed = JSON.parse(message) as PubSubEvent;
      handler(parsed);
    }
  });

  await subscriber.subscribe(channel);

  return {
    unsubscribe: async () => {
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    },
  };
}
