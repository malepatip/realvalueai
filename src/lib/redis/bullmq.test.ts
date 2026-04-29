import { describe, it, expect, vi, beforeEach } from "vitest";
import { QUEUE_NAMES, getAllQueueNames, type QueueName } from "./bullmq";

vi.mock("bullmq", () => {
  class MockQueue {
    name: string;
    close = vi.fn().mockResolvedValue(undefined);
    constructor(name: string, _opts?: unknown) {
      this.name = name;
    }
  }
  return { Queue: MockQueue };
});

describe("QUEUE_NAMES", () => {
  it("contains all 8 required queue names", () => {
    expect(Object.keys(QUEUE_NAMES)).toHaveLength(8);
  });

  it("has correct queue name values matching design doc", () => {
    expect(QUEUE_NAMES.INBOUND).toBe("inbound-messages");
    expect(QUEUE_NAMES.CONDUCTOR).toBe("conductor-tasks");
    expect(QUEUE_NAMES.WATCHER).toBe("watcher-tasks");
    expect(QUEUE_NAMES.FIXER).toBe("fixer-tasks");
    expect(QUEUE_NAMES.HUNTER).toBe("hunter-tasks");
    expect(QUEUE_NAMES.VOICE).toBe("voice-outbound");
    expect(QUEUE_NAMES.FIXER_BROWSER).toBe("fixer-browser-jobs");
    expect(QUEUE_NAMES.DEAD_LETTER).toBe("dead-letter");
  });

  it("values are typed as const (readonly at compile time)", () => {
    // `as const` provides compile-time readonly — verify the values are strings
    const values = Object.values(QUEUE_NAMES);
    values.forEach((v) => expect(typeof v).toBe("string"));
  });
});

describe("getAllQueueNames", () => {
  it("returns all queue name values", () => {
    const names = getAllQueueNames();
    expect(names).toHaveLength(8);
    expect(names).toContain("inbound-messages");
    expect(names).toContain("conductor-tasks");
    expect(names).toContain("dead-letter");
  });
});

describe("getQueue", () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it("creates a queue with the given name", async () => {
    const { getQueue } = await import("./bullmq");
    const queue = getQueue(
      "inbound-messages" as QueueName,
      "redis://localhost:6379",
    );
    expect(queue.name).toBe("inbound-messages");
  });

  it("returns the same queue instance on repeated calls", async () => {
    const { getQueue } = await import("./bullmq");
    const q1 = getQueue(
      "conductor-tasks" as QueueName,
      "redis://localhost:6379",
    );
    const q2 = getQueue(
      "conductor-tasks" as QueueName,
      "redis://localhost:6379",
    );
    expect(q1).toBe(q2);
  });

  it("creates different instances for different queue names", async () => {
    const { getQueue } = await import("./bullmq");
    const q1 = getQueue(
      "inbound-messages" as QueueName,
      "redis://localhost:6379",
    );
    const q2 = getQueue(
      "dead-letter" as QueueName,
      "redis://localhost:6379",
    );
    expect(q1).not.toBe(q2);
    expect(q1.name).toBe("inbound-messages");
    expect(q2.name).toBe("dead-letter");
  });
});

describe("closeAllQueues", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("closes all created queues", async () => {
    const { getQueue, closeAllQueues } = await import("./bullmq");
    const q1 = getQueue(
      "inbound-messages" as QueueName,
      "redis://localhost:6379",
    );
    const q2 = getQueue(
      "fixer-tasks" as QueueName,
      "redis://localhost:6379",
    );
    await closeAllQueues();
    expect(q1.close).toHaveBeenCalled();
    expect(q2.close).toHaveBeenCalled();
  });
});
