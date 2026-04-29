import { z } from "zod/v4";

/** All agent types in the RealValue multi-agent system */
export type AgentType = "conductor" | "watcher" | "fixer" | "hunter" | "voice";

/** Message types exchanged between agents */
export type AgentMessageType =
  | "task"
  | "response"
  | "event"
  | "priority_change"
  | "health";

/** Priority levels for inter-agent messages */
export type AgentMessagePriority = "critical" | "high" | "normal" | "low";

/** Inter-agent message envelope — the standard unit of communication between agents */
export interface AgentMessage {
  /** UUID v4 identifier */
  readonly id: string;
  /** ISO 8601 timestamp */
  readonly timestamp: string;
  readonly sourceAgent: AgentType;
  readonly targetAgent: AgentType;
  readonly userId: string;
  readonly type: AgentMessageType;
  readonly priority: AgentMessagePriority;
  readonly payload: Record<string, unknown>;
  /** Links related messages across agents */
  readonly correlationId: string;
  /** Seconds before message expires */
  readonly ttl: number;
}

/** Zod schema for runtime validation of AgentMessage from external inputs */
export const AgentMessageSchema = z.object({
  id: z.uuid(),
  timestamp: z.iso.datetime(),
  sourceAgent: z.enum(["conductor", "watcher", "fixer", "hunter", "voice"]),
  targetAgent: z.enum(["conductor", "watcher", "fixer", "hunter", "voice"]),
  userId: z.string().min(1),
  type: z.enum(["task", "response", "event", "priority_change", "health"]),
  priority: z.enum(["critical", "high", "normal", "low"]),
  payload: z.record(z.string(), z.unknown()),
  correlationId: z.uuid(),
  ttl: z.number().int().nonnegative(),
});


/** BullMQ queue name constants */
export const QUEUES = {
  INBOUND: "inbound-messages",
  CONDUCTOR: "conductor-tasks",
  WATCHER: "watcher-tasks",
  FIXER: "fixer-tasks",
  HUNTER: "hunter-tasks",
  VOICE: "voice-outbound",
  FIXER_BROWSER: "fixer-browser-jobs",
  DEAD_LETTER: "dead-letter",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Event logged to the append-only agent_event_logs table */
export interface AgentEvent {
  readonly agent: AgentType;
  readonly eventType: string;
  readonly userId?: string;
  readonly payload: Record<string, unknown>;
  readonly correlationId?: string;
}

/** Zod schema for AgentEvent validation */
export const AgentEventSchema = z.object({
  agent: z.enum(["conductor", "watcher", "fixer", "hunter", "voice"]),
  eventType: z.string().min(1),
  userId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  correlationId: z.uuid().optional(),
});
