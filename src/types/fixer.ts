import { z } from "zod/v4";

/** Browser automation action types */
export type BrowserActionType = "cancel" | "negotiate" | "apply" | "transfer";

/** Browser job status progression */
export type BrowserJobStatusValue =
  | "queued"
  | "running"
  | "navigating"
  | "authenticating"
  | "executing"
  | "verifying"
  | "complete"
  | "failed";

/** A browser automation job dispatched to Railway/Fly.io workers */
export interface BrowserJob {
  readonly jobId: string;
  readonly userId: string;
  readonly actionId: string;
  readonly provider: string;
  readonly actionType: BrowserActionType;
  readonly credentialVaultEntryId?: string;
  readonly maxRetries: number;
  readonly screenshotAtEveryStep: true;
}

/** Status of a running or completed browser job */
export interface BrowserJobStatus {
  readonly jobId: string;
  readonly status: BrowserJobStatusValue;
  readonly currentStep: string;
  readonly screenshots: readonly string[];
  readonly result?: ActionResult;
  readonly error?: string;
}

/** Action status workflow */
export type ActionStatus =
  | "pending"
  | "approved"
  | "executing"
  | "delayed"
  | "complete"
  | "failed"
  | "rejected"
  | "snoozed"
  | "cancelled";

/** An action approved by the user for execution */
export interface ApprovedAction {
  readonly id: string;
  readonly userId: string;
  readonly actionType: BrowserActionType;
  readonly targetMerchant: string;
  readonly targetAccountId?: string;
  /** Decimal string — estimated savings */
  readonly estimatedSavings?: string;
  readonly tier?: string;
  readonly credentialVaultEntryId?: string;
  readonly correlationId?: string;
}

/** Result of an executed action */
export interface ActionResult {
  readonly success: boolean;
  readonly actionId: string;
  readonly method: "browser" | "api" | "walkthrough" | "delegation";
  /** Decimal string — actual savings achieved */
  readonly actualSavings?: string;
  readonly screenshots: readonly string[];
  readonly errorMessage?: string;
}

/** Result of guardrail enforcement check */
export interface GuardrailResult {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly phase: string;
  /** Decimal string — remaining daily limit */
  readonly remainingDailyLimit?: string;
}

/** Provider compatibility score from the community database */
export interface CompatibilityScore {
  readonly providerName: string;
  readonly providerUrl?: string;
  readonly automationMethod: string;
  /** Decimal string — success rate (0.0000 to 1.0000) */
  readonly successRate: string;
  readonly lastTestedAt?: string;
  readonly failureReason?: string;
  readonly totalAttempts: number;
  readonly totalSuccesses: number;
}

/** Step-by-step guided walkthrough when automation fails or for free tier */
export interface GuidedWalkthrough {
  readonly actionId: string;
  readonly provider: string;
  readonly steps: readonly WalkthroughStep[];
}

/** A single step in a guided walkthrough */
export interface WalkthroughStep {
  readonly stepNumber: number;
  readonly instruction: string;
  readonly url?: string;
  readonly screenshotUrl?: string;
}

/** Delegation kit for human-assisted action completion */
export interface DelegationKit {
  readonly actionId: string;
  readonly provider: string;
  readonly phoneNumber?: string;
  readonly chatUrl?: string;
  readonly emailTemplate?: string;
  readonly instructions: string;
}

/** Zod schema for BrowserJob validation */
export const BrowserJobSchema = z.object({
  jobId: z.uuid(),
  userId: z.string().min(1),
  actionId: z.uuid(),
  provider: z.string().min(1),
  actionType: z.enum(["cancel", "negotiate", "apply", "transfer"]),
  credentialVaultEntryId: z.uuid().optional(),
  maxRetries: z.number().int().nonnegative(),
  screenshotAtEveryStep: z.literal(true),
});

/** Zod schema for ApprovedAction validation */
export const ApprovedActionSchema = z.object({
  id: z.uuid(),
  userId: z.string().min(1),
  actionType: z.enum(["cancel", "negotiate", "apply", "transfer"]),
  targetMerchant: z.string().min(1),
  targetAccountId: z.uuid().optional(),
  estimatedSavings: z.string().optional(),
  tier: z.string().optional(),
  credentialVaultEntryId: z.uuid().optional(),
  correlationId: z.uuid().optional(),
});
