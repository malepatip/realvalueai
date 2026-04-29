import { Queue, QueueOptions } from "bullmq";

export const QUEUE_NAMES = {
  INBOUND: "inbound-messages",
  CONDUCTOR: "conductor-tasks",
  WATCHER: "watcher-tasks",
  FIXER: "fixer-tasks",
  HUNTER: "hunter-tasks",
  VOICE: "voice-outbound",
  FIXER_BROWSER: "fixer-browser-jobs",
  DEAD_LETTER: "dead-letter",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const _queues = new Map<string, Queue>();

export function getQueue(
  name: QueueName,
  connectionUrl: string,
  opts?: Partial<QueueOptions>,
): Queue {
  const existing = _queues.get(name);
  if (existing) {
    return existing;
  }

  const queue = new Queue(name, {
    connection: { url: connectionUrl },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
    ...opts,
  });

  _queues.set(name, queue);
  return queue;
}

export function getAllQueueNames(): readonly QueueName[] {
  return Object.values(QUEUE_NAMES);
}

export async function closeAllQueues(): Promise<void> {
  const closePromises = Array.from(_queues.values()).map((q) => q.close());
  await Promise.all(closePromises);
  _queues.clear();
}
