/**
 * Trust Ladder State Machine
 *
 * Manages phase transitions for the progressive autonomy system.
 * Phases: 0 (chat-only) → 1 (ghost actions) → 2 (supervised) → 3 (autopilot)
 * Special state: "killed" — all operations halted via kill switch.
 *
 * @module trust/state-machine
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type Redis from "ioredis";
import type {
  TrustPhase,
  PhaseTrigger,
  PhaseTransitionResult,
  KillSwitchResult,
} from "@/types/trust";
import { lockVault } from "@/lib/vault/vault";
import { publishEvent, CHANNELS } from "@/lib/agents/pubsub";
import { checkPhase3Eligibility } from "./phase3-eligibility";

/** Redis cache key for a user's trust phase */
function cacheKey(userId: string): string {
  return `trust:phase:${userId}`;
}

/** Cache TTL in seconds — 5 minutes */
const CACHE_TTL_SECONDS = 300;

/**
 * Valid phase transition map.
 * Each key is the current phase; value maps trigger → target phase.
 */
const TRANSITION_RULES: Record<
  TrustPhase,
  Partial<Record<PhaseTrigger, TrustPhase>>
> = {
  phase_0: { bank_connected: "phase_1" },
  phase_1: { actions_enabled: "phase_2" },
  phase_2: { phase3_qualified: "phase_3" },
  phase_3: {},
  killed: { user_re_engaged: "phase_0" },
};

/**
 * Read the user's current trust phase from cache (Redis) or database.
 * Caches the result in Redis for subsequent reads.
 */
export async function getCurrentPhase(
  userId: string,
  supabase: SupabaseClient,
  redis?: Redis,
): Promise<TrustPhase> {
  // Try cache first
  if (redis) {
    const cached = await redis.get(cacheKey(userId));
    if (cached) {
      return cached as TrustPhase;
    }
  }

  const { data, error } = await supabase
    .from("users")
    .select("trust_phase")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to fetch trust phase: ${error?.message ?? "user not found"}`);
  }

  const phase = data.trust_phase as TrustPhase;

  // Cache the result
  if (redis) {
    await redis.set(cacheKey(userId), phase, "EX", CACHE_TTL_SECONDS);
  }

  return phase;
}

/**
 * Attempt to advance the user's trust phase based on a trigger.
 *
 * Validates the transition against TRANSITION_RULES.
 * For phase3_qualified, also checks Phase 3 eligibility criteria.
 */
export async function advancePhase(
  userId: string,
  trigger: PhaseTrigger,
  supabase: SupabaseClient,
  redis: Redis,
): Promise<PhaseTransitionResult> {
  const currentPhase = await getCurrentPhase(userId, supabase, redis);

  const phaseRules = TRANSITION_RULES[currentPhase];
  const targetPhase = phaseRules?.[trigger];

  if (!targetPhase) {
    return {
      success: false,
      previousPhase: currentPhase,
      newPhase: currentPhase,
      trigger,
      reason: `Invalid transition: ${trigger} not allowed from ${currentPhase}`,
    };
  }

  // Phase 3 requires additional eligibility checks
  if (trigger === "phase3_qualified") {
    const eligibility = await checkPhase3Eligibility(userId, supabase);
    if (!eligibility.eligible) {
      return {
        success: false,
        previousPhase: currentPhase,
        newPhase: currentPhase,
        trigger,
        reason: `Phase 3 eligibility not met: ${eligibility.reasons.join("; ")}`,
      };
    }
  }

  // Persist the new phase
  const { error } = await supabase
    .from("users")
    .update({ trust_phase: targetPhase })
    .eq("id", userId);

  if (error) {
    throw new Error(`Failed to update trust phase: ${error.message}`);
  }

  // Update cache
  await redis.set(cacheKey(userId), targetPhase, "EX", CACHE_TTL_SECONDS);

  return {
    success: true,
    previousPhase: currentPhase,
    newPhase: targetPhase,
    trigger,
  };
}

/**
 * Voluntarily downgrade a user's trust phase to any lower phase.
 * Only allows downgrading — target must be strictly lower than current.
 */
export async function downgradePhase(
  userId: string,
  targetPhase: TrustPhase,
  supabase: SupabaseClient,
  redis: Redis,
): Promise<PhaseTransitionResult> {
  const currentPhase = await getCurrentPhase(userId, supabase, redis);

  const phaseOrder: Record<TrustPhase, number> = {
    killed: -1,
    phase_0: 0,
    phase_1: 1,
    phase_2: 2,
    phase_3: 3,
  };

  const currentOrder = phaseOrder[currentPhase];
  const targetOrder = phaseOrder[targetPhase];

  // Cannot downgrade from killed — use advancePhase with user_re_engaged
  if (currentPhase === "killed") {
    return {
      success: false,
      previousPhase: currentPhase,
      newPhase: currentPhase,
      trigger: "voluntary_downgrade",
      reason: "Cannot downgrade from killed state; use re-engagement flow",
    };
  }

  // Target must be a normal phase (not killed) and strictly lower
  if (targetPhase === "killed" || targetOrder >= currentOrder) {
    return {
      success: false,
      previousPhase: currentPhase,
      newPhase: currentPhase,
      trigger: "voluntary_downgrade",
      reason: `Cannot downgrade from ${currentPhase} to ${targetPhase}`,
    };
  }

  const { error } = await supabase
    .from("users")
    .update({ trust_phase: targetPhase })
    .eq("id", userId);

  if (error) {
    throw new Error(`Failed to downgrade trust phase: ${error.message}`);
  }

  await redis.set(cacheKey(userId), targetPhase, "EX", CACHE_TTL_SECONDS);

  return {
    success: true,
    previousPhase: currentPhase,
    newPhase: targetPhase,
    trigger: "voluntary_downgrade",
  };
}

/**
 * Execute the kill switch — must complete within 5 seconds.
 *
 * Steps (all run concurrently for speed):
 * 1. Revoke bank tokens (set status = 'revoked')
 * 2. Lock credential vault
 * 3. Halt operations (publish kill event via Redis pub/sub)
 * 4. Set trust_phase = 'killed'
 *
 * Returns timing and step results.
 */
export async function executeKillSwitch(
  userId: string,
  supabase: SupabaseClient,
  redis: Redis,
): Promise<KillSwitchResult> {
  const startTime = Date.now();

  // Run all kill switch steps concurrently
  const [tokenResult, vaultResult, haltResult, phaseResult] =
    await Promise.allSettled([
      // 1. Revoke bank tokens
      supabase
        .from("bank_connections")
        .update({ status: "revoked" })
        .eq("user_id", userId)
        .eq("status", "active"),

      // 2. Lock vault
      lockVault(supabase, userId),

      // 3. Halt operations — publish kill event
      publishEvent(
        CHANNELS.KILL_SWITCH,
        { userId, action: "kill", timestamp: new Date().toISOString() },
        redis,
      ),

      // 4. Set trust_phase = 'killed'
      supabase
        .from("users")
        .update({ trust_phase: "killed" })
        .eq("id", userId),
    ]);

  // Invalidate cache
  await redis.del(cacheKey(userId));

  const totalTimeMs = Date.now() - startTime;

  return {
    tokensRevoked: tokenResult.status === "fulfilled",
    vaultLocked: vaultResult.status === "fulfilled",
    operationsHalted: haltResult.status === "fulfilled",
    confirmationSent: phaseResult.status === "fulfilled",
    totalTimeMs,
  };
}
