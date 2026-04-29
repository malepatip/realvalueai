/**
 * Trust Ladder Guardrails
 *
 * Enforces per-phase spending limits and action tier classification.
 * All monetary comparisons use the Money class — never IEEE 754 floats.
 *
 * @module trust/guardrails
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuardrailResult } from "@/types/fixer";
import type { TrustPhase } from "@/types/trust";
import { PHASE_GUARDRAILS } from "@/types/trust";
import { Money } from "@/lib/math/decimal";

/** Action descriptor passed to guardrail enforcement */
export interface GuardrailAction {
  readonly amount: string;
  readonly actionType: string;
  readonly isReversible: boolean;
  readonly providerSuccessRate?: string;
}

/**
 * Enforce guardrails for a given user and action based on their trust phase.
 *
 * - Phase 0/1: reject all actions (canExecuteActions = false)
 * - Phase 2: per-action $25 limit, daily aggregate $100 limit, require approval
 * - Phase 3: classify tier, then apply tier-specific rules
 */
export async function enforceGuardrails(
  userId: string,
  action: GuardrailAction,
  phase: TrustPhase,
  supabase: SupabaseClient,
): Promise<GuardrailResult> {
  // Phase 0 and Phase 1: no actions allowed
  if (phase === "phase_0" || phase === "phase_1") {
    return {
      allowed: false,
      reason: `Actions not permitted in ${phase}`,
      phase,
    };
  }

  // Killed state: no actions allowed
  if (phase === "killed") {
    return {
      allowed: false,
      reason: "Account is in killed state — all actions halted",
      phase,
    };
  }

  const actionAmount = Money.fromString(action.amount);

  // Phase 2: supervised mode with strict limits
  if (phase === "phase_2") {
    const guardrails = PHASE_GUARDRAILS.phase_2;
    const perActionLimit = Money.fromString(guardrails.perActionLimit);
    const dailyLimit = Money.fromString(guardrails.dailyAggregateLimit);

    // Check per-action limit
    if (actionAmount.isGreaterThan(perActionLimit)) {
      return {
        allowed: false,
        reason: `Amount ${actionAmount.format()} exceeds per-action limit of ${perActionLimit.format()}`,
        phase,
      };
    }

    // Check daily aggregate
    const dailyAggregate = await getDailyAggregate(userId, supabase);
    const projectedTotal = dailyAggregate.add(actionAmount);

    if (projectedTotal.isGreaterThan(dailyLimit)) {
      const remaining = dailyLimit.subtract(dailyAggregate);
      return {
        allowed: false,
        reason: `Would exceed daily limit of ${dailyLimit.format()}. Remaining: ${remaining.format()}`,
        phase,
        remainingDailyLimit: remaining.isNegative()
          ? "0.0000"
          : remaining.toNumericString(),
      };
    }

    const remaining = dailyLimit.subtract(projectedTotal);
    return {
      allowed: true,
      phase,
      remainingDailyLimit: remaining.toNumericString(),
    };
  }

  // Phase 3: tier-based guardrails
  const tier = classifyActionTier(action);

  if (tier === 1) {
    return {
      allowed: true,
      reason: "Tier 1: auto-execute (low amount, reversible)",
      phase,
    };
  }

  if (tier === 2) {
    return {
      allowed: true,
      reason: "Tier 2: auto-execute with notification and 24h undo window",
      phase,
    };
  }

  // Tier 3
  return {
    allowed: false,
    reason: "Tier 3: requires explicit user approval (high amount or irreversible)",
    phase,
  };
}

/**
 * Classify an action into Tier 1, 2, or 3 based on amount and reversibility.
 *
 * - Tier 1: amount < $10 AND reversible → auto-execute
 * - Tier 2: moderate amount (>= $10), reversible → notify + 24h undo window
 * - Tier 3: high amount or irreversible → require approval
 */
export function classifyActionTier(action: {
  amount: string;
  isReversible: boolean;
  providerSuccessRate?: string;
}): 1 | 2 | 3 {
  // Irreversible actions are always Tier 3
  if (!action.isReversible) {
    return 3;
  }

  const amount = Money.fromString(action.amount);
  const tier1Max = Money.fromString(PHASE_GUARDRAILS.phase_3.tier1.maxAmount);

  // Tier 1: under $10 and reversible
  if (amount.isLessThan(tier1Max)) {
    return 1;
  }

  // Tier 2: moderate amount, reversible
  return 2;
}

/**
 * Sum today's executed action amounts for a user.
 * Queries agent_actions with status = 'complete' and executed_at = today.
 * Returns Money instance representing the daily aggregate.
 */
export async function getDailyAggregate(
  userId: string,
  supabase: SupabaseClient,
): Promise<Money> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("agent_actions")
    .select("financial_impact")
    .eq("user_id", userId)
    .eq("status", "complete")
    .gte("executed_at", todayStart.toISOString());

  if (error) {
    throw new Error(`Failed to fetch daily aggregate: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return Money.fromString("0");
  }

  let total = Money.fromString("0");
  for (const row of data) {
    const impact = row.financial_impact as string | null;
    if (impact) {
      total = total.add(Money.fromString(impact));
    }
  }

  return total;
}
