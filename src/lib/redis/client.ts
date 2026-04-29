import Redis from "ioredis";

let _redisInstance: Redis | undefined;

export interface RedisClientOptions {
  url: string;
  maxRetriesPerRequest?: number | null;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
}

export function createRedisClient(options: RedisClientOptions): Redis {
  const {
    url,
    maxRetriesPerRequest = null,
    retryDelayMs = 500,
    maxRetryDelayMs = 5000,
  } = options;

  const client = new Redis(url, {
    maxRetriesPerRequest,
    retryStrategy(times: number): number {
      const delay = Math.min(times * retryDelayMs, maxRetryDelayMs);
      return delay;
    },
    reconnectOnError(err: Error): boolean {
      const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
      return targetErrors.some((e) => err.message.includes(e));
    },
    enableReadyCheck: true,
    lazyConnect: false,
  });

  return client;
}

export function getRedisClient(url: string): Redis {
  if (!_redisInstance) {
    _redisInstance = createRedisClient({ url });
  }
  return _redisInstance;
}

export async function disconnectRedis(): Promise<void> {
  if (_redisInstance) {
    await _redisInstance.quit();
    _redisInstance = undefined;
  }
}
