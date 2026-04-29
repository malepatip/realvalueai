import { z } from "zod/v4";
import type { AgentType } from "./agents";

/** User intent categories classified by the Conductor */
export type IntentType =
  | "cancel_subscription"
  | "check_balance"
  | "find_benefits"
  | "ask_question"
  | "approve_action"
  | "reject_action"
  | "snooze_action"
  | "stop_command"
  | "pause_command"
  | "change_mode"
  | "general_chat";

/** Result of intent classification on an inbound user message */
export interface IntentClassification {
  readonly intent: IntentType;
  readonly confidence: number;
  readonly targetAgent: AgentType;
  readonly extractedEntities: Record<string, string>;
}

/** A detected life change event that triggers priority shifts */
export interface LifeChangeEvent {
  readonly eventType: string;
  readonly detectedAt: string;
  readonly confidence: number;
  readonly indicators: readonly string[];
}

/** A recommendation from an agent, collected by the Conductor for conflict resolution */
export interface AgentRecommendation {
  readonly sourceAgent: AgentType;
  readonly actionType: string;
  readonly targetMerchant?: string;
  /** Decimal string — estimated savings */
  readonly estimatedSavings?: string;
  readonly priority: "critical" | "high" | "normal" | "low";
  readonly reasoning: string;
  readonly correlationId: string;
}

/** Health report for all agents — used for failover detection */
export interface AgentHealthReport {
  readonly agents: Record<
    AgentType,
    {
      readonly lastPingAt: string;
      readonly isHealthy: boolean;
      readonly missedPings: number;
    }
  >;
  readonly conductorHealthy: boolean;
  readonly autonomousModeActive: boolean;
}

/** User's life-stage priorities used for conflict resolution scoring */
export interface UserPriorities {
  readonly userId: string;
  readonly lifeStage?: string;
  readonly priorities: Record<string, number>;
}

/** Zod schema for IntentClassification validation */
export const IntentClassificationSchema = z.object({
  intent: z.enum([
    "cancel_subscription",
    "check_balance",
    "find_benefits",
    "ask_question",
    "approve_action",
    "reject_action",
    "snooze_action",
    "stop_command",
    "pause_command",
    "change_mode",
    "general_chat",
  ]),
  confidence: z.number().min(0).max(1),
  targetAgent: z.enum(["conductor", "watcher", "fixer", "hunter", "voice"]),
  extractedEntities: z.record(z.string(), z.string()),
});
