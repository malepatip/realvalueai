/**
 * Phase 3 Eligibility Checker
 *
 * Determines whether a user qualifies for Phase 3 (autopilot) by checking:
 * - 20+ approved actions in Phase 2
 * - >70% approval rate
 * - KYC verified
 *
 * @module trust/phase3-eligibility
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface Phase3EligibilityResult {
  readonly eligible: boolean;
  readonly approvalCount: number;
  readonly approvalRate: number;
  readonly kycVerified: boolean;
  readonly reasons: string[];
}

const MIN_APPROVAL_COUNT = 20;
const MIN_APPROVAL_RATE = 0.7;

/**
 * Check whether a user meets all Phase 3 eligibility criteria.
 *
 * Reads phase2_approval_count, phase2_total_actions, and kyc_verified
 * from the users table and evaluates against thresholds.
 */
export async function checkPhase3Eligibility(
  userId: string,
  supabase: SupabaseClient,
): Promise<Phase3EligibilityResult> {
  const { data, error } = await supabase
    .from("users")
    .select("phase2_approval_count, phase2_total_actions, kyc_verified")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to fetch user eligibility data: ${error?.message ?? "user not found"}`);
  }

  const approvalCount = data.phase2_approval_count as number;
  const totalActions = data.phase2_total_actions as number;
  const kycVerified = data.kyc_verified as boolean;

  const approvalRate = totalActions > 0 ? approvalCount / totalActions : 0;

  const reasons: string[] = [];

  if (approvalCount < MIN_APPROVAL_COUNT) {
    reasons.push(`Need ${MIN_APPROVAL_COUNT} approvals, have ${approvalCount}`);
  }

  if (approvalRate <= MIN_APPROVAL_RATE) {
    reasons.push(
      `Need >${(MIN_APPROVAL_RATE * 100).toFixed(0)}% approval rate, have ${(approvalRate * 100).toFixed(1)}%`,
    );
  }

  if (!kycVerified) {
    reasons.push("KYC verification required");
  }

  const eligible =
    approvalCount >= MIN_APPROVAL_COUNT &&
    approvalRate > MIN_APPROVAL_RATE &&
    kycVerified;

  return {
    eligible,
    approvalCount,
    approvalRate,
    kycVerified,
    reasons,
  };
}
