import { describe, it, expect } from "vitest";
import { createAgentMessage, validateAgentMessage } from "./protocol";
import type { AgentMessage } from "@/types/agents";

describe("createAgentMessage", () => {
  it("creates a message with UUID id and ISO timestamp", () => {
    const msg = createAgentMessage(
      "conductor",
      "watcher",
      "task",
      { action: "scan" },
      "user-123",
    );

    expect(msg.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(() => new Date(msg.timestamp).toISOString()).not.toThrow();
    expect(msg.sourceAgent).toBe("conductor");
    expect(msg.targetAgent).toBe("watcher");
    expect(msg.type).toBe("task");
    expect(msg.payload).toEqual({ action: "scan" });
    expect(msg.userId).toBe("user-123");
    expect(msg.priority).toBe("normal");
    expect(msg.ttl).toBe(300);
    expect(msg.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("accepts custom priority, correlationId, and ttl", () => {
    const msg = createAgentMessage(
      "fixer",
      "voice",
      "response",
      {},
      "user-456",
      {
        priority: "critical",
        correlationId: "550e8400-e29b-41d4-a716-446655440000",
        ttl: 60,
      },
    );

    expect(msg.priority).toBe("critical");
    expect(msg.correlationId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(msg.ttl).toBe(60);
  });

  it("generates unique ids for each message", () => {
    const msg1 = createAgentMessage("watcher", "conductor", "event", {}, "u1");
    const msg2 = createAgentMessage("watcher", "conductor", "event", {}, "u1");
    expect(msg1.id).not.toBe(msg2.id);
  });
});

describe("validateAgentMessage", () => {
  function validMessage(): AgentMessage {
    return createAgentMessage(
      "hunter",
      "voice",
      "response",
      { savings: "42.00" },
      "user-789",
    );
  }

  it("validates a correct agent message", () => {
    const result = validateAgentMessage(validMessage());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceAgent).toBe("hunter");
    }
  });

  it("rejects a message with missing id", () => {
    const msg = { ...validMessage(), id: undefined };
    const result = validateAgentMessage(msg);
    expect(result.success).toBe(false);
  });

  it("rejects a message with invalid agent type", () => {
    const msg = { ...validMessage(), sourceAgent: "unknown-agent" };
    const result = validateAgentMessage(msg);
    expect(result.success).toBe(false);
  });

  it("rejects a message with invalid priority", () => {
    const msg = { ...validMessage(), priority: "urgent" };
    const result = validateAgentMessage(msg);
    expect(result.success).toBe(false);
  });

  it("rejects a message with empty userId", () => {
    const msg = { ...validMessage(), userId: "" };
    const result = validateAgentMessage(msg);
    expect(result.success).toBe(false);
  });

  it("rejects a non-object input", () => {
    const result = validateAgentMessage("not-an-object");
    expect(result.success).toBe(false);
  });

  it("rejects null input", () => {
    const result = validateAgentMessage(null);
    expect(result.success).toBe(false);
  });

  it("returns error string on failure", () => {
    const result = validateAgentMessage({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});
