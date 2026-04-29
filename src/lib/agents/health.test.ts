import { describe, it, expect, vi, beforeEach } from "vitest";
import { HEALTH_PING_INTERVAL_MS } from "./health";

// Mock Redis client
const mockSet = vi.fn();
const mockGet = vi.fn();
const mockPublish = vi.fn();

const mockRedisClient = {
  set: mockSet,
  get: mockGet,
  publish: mockPublish,
};

// Mock pubsub
vi.mock("./pubsub", () => ({
  CHANNELS: {
    HEALTH: "agent:health",
    KILL_SWITCH: "agent:kill-switch",
    PRIORITY_CHANGE: "agent:priority-change",
  },
  publishEvent: vi.fn().mockResolvedValue(1),
}));

const { sendHealthPing, checkAgentHealth, startHealthPingLoop } = await import(
  "./health"
);
const { publishEvent } = await import("./pubsub");

describe("sendHealthPing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue("OK");
  });

  it("stores the ping timestamp in Redis with TTL", async () => {
    await sendHealthPing("watcher", mockRedisClient as never);

    expect(mockSet).toHaveBeenCalledWith(
      "agent:health:last-ping:watcher",
      expect.any(String),
      "EX",
      60,
    );
  });

  it("publishes a health event on the health channel", async () => {
    await sendHealthPing("conductor", mockRedisClient as never);

    expect(publishEvent).toHaveBeenCalledWith(
      "agent:health",
      expect.objectContaining({ agent: "conductor" }),
      mockRedisClient,
    );
  });
});

describe("checkAgentHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports all agents healthy when pings are recent", async () => {
    const recentPing = new Date().toISOString();
    mockGet.mockResolvedValue(recentPing);

    const report = await checkAgentHealth(mockRedisClient as never);

    expect(report.conductorHealthy).toBe(true);
    expect(report.autonomousModeActive).toBe(false);
    expect(report.agents.conductor.isHealthy).toBe(true);
    expect(report.agents.watcher.isHealthy).toBe(true);
    expect(report.agents.fixer.isHealthy).toBe(true);
    expect(report.agents.hunter.isHealthy).toBe(true);
    expect(report.agents.voice.isHealthy).toBe(true);
  });

  it("reports agent unhealthy when no ping exists", async () => {
    mockGet.mockResolvedValue(null);

    const report = await checkAgentHealth(mockRedisClient as never);

    expect(report.agents.conductor.isHealthy).toBe(false);
    expect(report.agents.conductor.lastPingAt).toBe("");
    expect(report.agents.conductor.missedPings).toBe(3);
  });

  it("activates autonomous mode when conductor misses 3+ pings", async () => {
    // Conductor ping is old (35 seconds ago = 3 missed pings)
    const oldPing = new Date(
      Date.now() - HEALTH_PING_INTERVAL_MS * 3.5,
    ).toISOString();
    const recentPing = new Date().toISOString();

    mockGet.mockImplementation(async (key: string) => {
      if (key === "agent:health:last-ping:conductor") return oldPing;
      return recentPing;
    });

    const report = await checkAgentHealth(mockRedisClient as never);

    expect(report.conductorHealthy).toBe(false);
    expect(report.autonomousModeActive).toBe(true);
    expect(report.agents.conductor.missedPings).toBeGreaterThanOrEqual(3);
    // Other agents should still be healthy
    expect(report.agents.watcher.isHealthy).toBe(true);
  });

  it("keeps conductor healthy with fewer than 3 missed pings", async () => {
    // Conductor ping is 15 seconds ago = 1 missed ping
    const slightlyOld = new Date(
      Date.now() - HEALTH_PING_INTERVAL_MS * 1.5,
    ).toISOString();
    mockGet.mockResolvedValue(slightlyOld);

    const report = await checkAgentHealth(mockRedisClient as never);

    expect(report.conductorHealthy).toBe(true);
    expect(report.autonomousModeActive).toBe(false);
    expect(report.agents.conductor.missedPings).toBe(1);
  });
});

describe("startHealthPingLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSet.mockResolvedValue("OK");
  });

  it("sends an initial ping immediately", async () => {
    startHealthPingLoop("fixer", mockRedisClient as never);

    // Flush the microtask queue so the void promise from sendHealthPing resolves
    await vi.advanceTimersByTimeAsync(0);

    // publishEvent should have been called once for the immediate ping
    expect(publishEvent).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("stop function clears the interval", () => {
    const { stop } = startHealthPingLoop("hunter", mockRedisClient as never);

    vi.clearAllMocks();
    stop();

    // Advance time — no more pings should fire
    vi.advanceTimersByTime(HEALTH_PING_INTERVAL_MS * 3);
    expect(publishEvent).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
