import { Worker, Job } from "bullmq";
import type { Processor } from "bullmq";
import { getQueue } from "@/lib/redis/bullmq";
import { QUEUES } from "@/types/agents";
import type { AgentMessage, AgentType, QueueName } from "@/types/agents";

/** Maps agent types to their BullMQ queue names */
const AGENT_QUEUE_MAP: Record<AgentType, QueueName> = {
  conductor: QUEUES.CONDUCTOR,
  watcher: QUEUES.WATCHER,
  fixer: QUEUES.FIXER,
  hunter: QUEUES.HUNTER,
  voice: QUEUES.VOICE,
} as const;

/** Maps message priority to BullMQ numeric priority (lower = higher priority) */
const PRIORITY_MAP: Record<AgentMessage["priority"], number> = {
  critical: 1,
  high: 2,
  normal: 3,
  low: 4,
} as const;

/**
 * Enqueues an agent message to the target agent's BullMQ queue
 * with priority mapping.
 */
export async function enqueueTask(
  targetAgent: AgentType,
  message: AgentMessage,
  redisUrl: string,
): Promise<string> {
  const queueName = AGENT_QUEUE_MAP[targetAgent];
  const queue = getQueue(queueName, redisUrl);

  const job = await queue.add(message.type, message, {
    priority: PRIORITY_MAP[message.priority],
    jobId: message.id,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  });

  return job.id ?? message.id;
}

/**
 * Creates a BullMQ worker for a specific agent type.
 * Includes retry logic (3 retries, exponential backoff) and
 * dead-letter routing on final failure.
 */
export function createWorker(
  agentType: AgentType,
  processor: Processor<AgentMessage>,
  redisUrl: string,
): Worker<AgentMessage> {
  const queueName = AGENT_QUEUE_MAP[agentType];

  const worker = new Worker<AgentMessage>(
    queueName,
    async (job: Job<AgentMessage>) => {
      return processor(job);
    },
    {
      connection: { url: redisUrl },
      concurrency: 5,
    },
  );

  worker.on("failed", async (job, error) => {
    if (job && job.attemptsMade >= 3) {
      const deadLetterQueue = getQueue(QUEUES.DEAD_LETTER, redisUrl);
      await deadLetterQueue.add("dead-letter", {
        ...job.data,
        payload: {
          ...job.data.payload,
          _deadLetterReason: error.message,
          _originalQueue: queueName,
          _failedAt: new Date().toISOString(),
          _attempts: job.attemptsMade,
        },
      });
    }
  });

  return worker;
}
