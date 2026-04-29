import { v4 as uuidv4 } from "uuid";
import { AgentMessageSchema } from "@/types/agents";
import type {
  AgentMessage,
  AgentMessagePriority,
  AgentMessageType,
  AgentType,
} from "@/types/agents";

/**
 * Default TTL for agent messages (5 minutes).
 */
const DEFAULT_TTL_SECONDS = 300;

/**
 * Creates a new inter-agent message envelope with UUID, ISO timestamp,
 * and correlation ID.
 */
export function createAgentMessage(
  source: AgentType,
  target: AgentType,
  type: AgentMessageType,
  payload: Record<string, unknown>,
  userId: string,
  options?: {
    priority?: AgentMessagePriority;
    correlationId?: string;
    ttl?: number;
  },
): AgentMessage {
  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    sourceAgent: source,
    targetAgent: target,
    userId,
    type,
    priority: options?.priority ?? "normal",
    payload,
    correlationId: options?.correlationId ?? uuidv4(),
    ttl: options?.ttl ?? DEFAULT_TTL_SECONDS,
  };
}

/**
 * Validates an agent message envelope using the Zod schema.
 * Returns the validated message on success, or an error result on failure.
 */
export function validateAgentMessage(
  msg: unknown,
): { success: true; data: AgentMessage } | { success: false; error: string } {
  const result = AgentMessageSchema.safeParse(msg);
  if (result.success) {
    return { success: true, data: result.data as AgentMessage };
  }
  return {
    success: false,
    error: result.error.issues.map((i) => i.message).join("; "),
  };
}
