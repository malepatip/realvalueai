import { describe, it, expect, vi, beforeEach } from "vitest";
import { CHANNELS } from "./pubsub";
import type { PubSubEvent } from "./pubsub";

// Mock Redis client
const mockPublish = vi.fn();
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockQuit = vi.fn();
const mockOn = vi.fn();

const mockRedisClient = {
  publish: mockPublish,
  subscribe: mockSubscribe,
  unsubscribe: mockUnsubscribe,
  quit: mockQuit,
  on: mockOn,
};

vi.mock("@/lib/redis/client", () => ({
  createRedisClient: vi.fn(() => mockRedisClient),
}));

// Import after mocks
const { publishEvent, subscribeToEvents } = await import("./pubsub");

describe("publishEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPublish.mockResolvedValue(1);
  });

  it("publishes a JSON-serialized event to the correct channel", async () => {
    const event = { agent: "watcher", status: "online" };
    const count = await publishEvent(
      CHANNELS.HEALTH,
      event,
      mockRedisClient as never,
    );

    expect(count).toBe(1);
    expect(mockPublish).toHaveBeenCalledWith(
      "agent:health",
      expect.any(String),
    );

    const published = JSON.parse(
      mockPublish.mock.calls[0]![1] as string,
    ) as PubSubEvent;
    expect(published.channel).toBe("agent:health");
    expect(published.payload).toEqual(event);
    expect(published.timestamp).toBeDefined();
  });

  it("publishes kill-switch events", async () => {
    mockPublish.mockResolvedValue(3);
    const count = await publishEvent(
      CHANNELS.KILL_SWITCH,
      { userId: "u1", reason: "user-stop" },
      mockRedisClient as never,
    );

    expect(count).toBe(3);
    expect(mockPublish).toHaveBeenCalledWith(
      "agent:kill-switch",
      expect.any(String),
    );
  });

  it("publishes priority-change events", async () => {
    await publishEvent(
      CHANNELS.PRIORITY_CHANGE,
      { newPriority: "survival" },
      mockRedisClient as never,
    );

    expect(mockPublish).toHaveBeenCalledWith(
      "agent:priority-change",
      expect.any(String),
    );
  });
});

describe("subscribeToEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribe.mockResolvedValue(undefined);
    mockUnsubscribe.mockResolvedValue(undefined);
    mockQuit.mockResolvedValue(undefined);
  });

  it("subscribes to the specified channel", async () => {
    const handler = vi.fn();
    await subscribeToEvents(CHANNELS.HEALTH, handler, "redis://localhost:6379");

    expect(mockSubscribe).toHaveBeenCalledWith("agent:health");
  });

  it("invokes handler when a message is received on the channel", async () => {
    const handler = vi.fn();
    await subscribeToEvents(CHANNELS.HEALTH, handler, "redis://localhost:6379");

    // Find the "message" listener
    const messageCallback = mockOn.mock.calls.find(
      (c) => c[0] === "message",
    )?.[1];
    expect(messageCallback).toBeDefined();

    const event: PubSubEvent = {
      channel: CHANNELS.HEALTH,
      timestamp: new Date().toISOString(),
      payload: { agent: "watcher" },
    };
    messageCallback("agent:health", JSON.stringify(event));

    expect(handler).toHaveBeenCalledWith(event);
  });

  it("does not invoke handler for messages on other channels", async () => {
    const handler = vi.fn();
    await subscribeToEvents(CHANNELS.HEALTH, handler, "redis://localhost:6379");

    const messageCallback = mockOn.mock.calls.find(
      (c) => c[0] === "message",
    )?.[1];

    messageCallback("agent:kill-switch", JSON.stringify({ channel: "other" }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("returns an unsubscribe function that cleans up", async () => {
    const handler = vi.fn();
    const { unsubscribe } = await subscribeToEvents(
      CHANNELS.KILL_SWITCH,
      handler,
      "redis://localhost:6379",
    );

    await unsubscribe();

    expect(mockUnsubscribe).toHaveBeenCalledWith("agent:kill-switch");
    expect(mockQuit).toHaveBeenCalled();
  });
});
