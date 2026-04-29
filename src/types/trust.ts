import { z } from "zod/v4";

/** Trust Ladder phases — progressive autonomy from chat-only to autopilot */
export type TrustPhase = "phase_0" | "phase_1" | "phase_2" | "phase_3" | "killed";

/** Triggers that cause phase transitions */
export type PhaseTrigger =
  | "bank_connected"
  | "bank_disconnected"
  | "actions_enabled"
  | "phase3_qualified"
  | "voluntary_downgrade"
  | "stop_command"
  | "user_re_engaged";

/** Result of executing the kill switch — must complete in <5000ms */
export interface KillSwitchResult {
  readonly tokensRevoked: boolean;
  readonly vaultLocked: boolean;
  readonly operationsHalted: boolean;
  readonly confirmationSent: boolean;
  /** Must be < 5000ms */
  readonly totalTimeMs: number;
}

/** Result of a phase transition attempt */
export interface PhaseTransitionResult {
  readonly success: boolean;
  readonly previousPhase: TrustPhase;
  readonly newPhase: TrustPhase;
  readonly trigger: PhaseTrigger;
  readonly reason?: string;
}

/** Phase 3 tier-specific guardrail config */
export interface Phase3Tier1Guardrails {
  readonly autoExecute: true;
  /** Decimal string — max amount for auto-execute */
  readonly maxAmount: string;
  readonly mustBeReversible: true;
}

/** Phase 3 tier 2 guardrails — auto-execute with notification and undo window */
export interface Phase3Tier2Guardrails {
  readonly autoExecute: true;
  readonly notifyUser: true;
  readonly undoWindowHours: number;
}

/** Phase 3 tier 3 guardrails — always requires approval */
export interface Phase3Tier3Guardrails {
  readonly requiresApproval: true;
}

/** Per-phase guardrail configuration */
export interface PhaseGuardrails {
  readonly canExecuteActions: boolean;
  readonly ghostActionsEnabled?: boolean;
  /** Decimal string — per-action spending limit (Phase 2) */
  readonly perActionLimit?: string;
  /** Decimal string — daily aggregate spending limit (Phase 2) */
  readonly dailyAggregateLimit?: string;
  readonly requiresApproval?: boolean;
  readonly tier1?: Phase3Tier1Guardrails;
  readonly tier2?: Phase3Tier2Guardrails;
  readonly tier3?: Phase3Tier3Guardrails;
}


/** Constant guardrail configuration per trust phase — matches design doc exactly */
export const PHASE_GUARDRAILS = {
  phase_0: { canExecuteActions: false },
  phase_1: { canExecuteActions: false, ghostActionsEnabled: true },
  phase_2: {
    canExecuteActions: true,
    perActionLimit: "25.00",
    dailyAggregateLimit: "100.00",
    requiresApproval: true,
  },
  phase_3: {
    canExecuteActions: true,
    tier1: { autoExecute: true, maxAmount: "10.00", mustBeReversible: true },
    tier2: { autoExecute: true, notifyUser: true, undoWindowHours: 24 },
    tier3: { requiresApproval: true },
  },
} as const;

/** Zod schema for TrustPhase validation */
export const TrustPhaseSchema = z.enum([
  "phase_0",
  "phase_1",
  "phase_2",
  "phase_3",
  "killed",
]);

/** Zod schema for PhaseTrigger validation */
export const PhaseTriggerSchema = z.enum([
  "bank_connected",
  "bank_disconnected",
  "actions_enabled",
  "phase3_qualified",
  "voluntary_downgrade",
  "stop_command",
  "user_re_engaged",
]);
