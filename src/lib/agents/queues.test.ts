import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentMessage } from "@/types/agents";
import { QUEUES } from "@/types/agents";
import { createAgentMessage } from "./protocol";

// Mock BullMQ Queue
const mockAdd = vi.fn();
const mockQueueInstance = { add: mockAdd };

vi.mock("@/lib/redis/bullmq", () => ({
  getQueue: vi.fn(() => mockQueueInstance),
}));

// Mock BullMQ Worker — must be a class for `new Worker()`
const mockWorkerOn = vi.fn();
let capturedWorkerProcessor: ((job: unknown) => Promise<unknown>) | undefined;

vi.mock("bullmq", () => {
  const MockWorker = vi.fn(function (
    this: { on: typeof mockWorkerOn },
    _name: string,
    processor: (job: unknown) => Promise<unknown>,
  ) {
    capturedWorkerProcessor = processor;
    this.on = mockWorkerOn;
  });
  return { Worker: MockWorker, Job: vi.fn() };
});

// Import after mocks
const { enqueueTask, createWorker } = await import("./queues");
const { getQueue } = await import("@/lib/redis/bullmq");

describe("enqueueTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ id: "job-id-1" });
  });

  it("enqueues a message to the correct agent queue", async () => {
    const msg = createAgentMessage(
      "conductor",
      "watcher",
      "task",
      { scan: true },
      "user-1",
    );

    const jobId = await enqueueTask("watcher", msg, "redis://localhost:6379");

    expect(getQueue).toHaveBeenCalledWith(
      QUEUES.WATCHER,
      "redis://localhost:6379",
    );
    expect(mockAdd).toHaveBeenCalledWith("task", msg, {
      priority: 3, // "normal" maps to 3
      jobId: msg.id,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    });
    expect(jobId).toBe("job-id-1");
  });

  it("maps critical priority to 1", async () => {
    const msg = createAgentMessage(
      "conductor",
      "fixer",
      "task",
      {},
      "user-1",
      { priority: "critical" },
    );

    await enqueueTask("fixer", msg, "redis://localhost:6379");

    expect(mockAdd).toHaveBeenCalledWith(
      "task",
      msg,
      expect.objectContaining({ priority: 1 }),
    );
  });

  it("maps low priority to 4", async () => {
    const msg = createAgentMessage(
      "watcher",
      "hunter",
      "event",
      {},
      "user-1",
      { priority: "low" },
    );

    await enqueueTask("hunter", msg, "redis://localhost:6379");

    expect(mockAdd).toHaveBeenCalledWith(
      "event",
      msg,
      expect.objectContaining({ priority: 4 }),
    );
  });

  it("routes each agent type to the correct queue name", async () => {
    const agentQueuePairs: Array<[string, string]> = [
      ["conductor", QUEUES.CONDUCTOR],
      ["watcher", QUEUES.WATCHER],
      ["fixer", QUEUES.FIXER],
      ["hunter", QUEUES.HUNTER],
      ["voice", QUEUES.VOICE],
    ];

    for (const [agent, expectedQueue] of agentQueuePairs) {
      vi.clearAllMocks();
      mockAdd.mockResolvedValue({ id: "j" });
      const msg = createAgentMessage(
        "conductor",
        agent as AgentMessage["targetAgent"],
        "task",
        {},
        "u",
      );
      await enqueueTask(
        agent as AgentMessage["targetAgent"],
        msg,
        "redis://localhost:6379",
      );
      expect(getQueue).toHaveBeenCalledWith(
        expectedQueue,
        "redis://localhost:6379",
      );
    }
  });
});

describe("createWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedWorkerProcessor = undefined;
  });

  it("creates a worker that invokes the processor", async () => {
    const processor = vi.fn().mockResolvedValue("done");

    createWorker("watcher", processor, "redis://localhost:6379");

    expect(capturedWorkerProcessor).toBeDefined();

    const fakeJob = { data: { type: "task" } };
    await capturedWorkerProcessor!(fakeJob);

    expect(processor).toHaveBeenCalledWith(fakeJob);
  });

  it("registers a failed event handler for dead-letter routing", () => {
    const processor = vi.fn();
    createWorker("fixer", processor, "redis://localhost:6379");

    expect(mockWorkerOn).toHaveBeenCalledWith("failed", expect.any(Function));
  });

  it("routes to dead-letter queue after 3 failed attempts", async () => {
    const processor = vi.fn();
    createWorker("fixer", processor, "redis://localhost:6379");

    // Get the "failed" handler
    const failedHandler = mockWorkerOn.mock.calls.find(
      (c) => c[0] === "failed",
    )?.[1];
    expect(failedHandler).toBeDefined();

    const fakeJob = {
      data: createAgentMessage("conductor", "fixer", "task", {}, "u1"),
      attemptsMade: 3,
    };

    await failedHandler(fakeJob, new Error("timeout"));

    // Should have called getQueue for dead-letter
    expect(getQueue).toHaveBeenCalledWith(
      QUEUES.DEAD_LETTER,
      "redis://localhost:6379",
    );
    expect(mockAdd).toHaveBeenCalledWith(
      "dead-letter",
      expect.objectContaining({
        payload: expect.objectContaining({
          _deadLetterReason: "timeout",
          _originalQueue: QUEUES.FIXER,
        }),
      }),
    );
  });

  it("does NOT route to dead-letter if attempts < 3", async () => {
    const processor = vi.fn();
    createWorker("hunter", processor, "redis://localhost:6379");

    const failedHandler = mockWorkerOn.mock.calls.find(
      (c) => c[0] === "failed",
    )?.[1];

    const fakeJob = {
      data: createAgentMessage("conductor", "hunter", "task", {}, "u1"),
      attemptsMade: 2,
    };

    vi.clearAllMocks();
    await failedHandler(fakeJob, new Error("retry"));

    expect(mockAdd).not.toHaveBeenCalled();
  });
});
