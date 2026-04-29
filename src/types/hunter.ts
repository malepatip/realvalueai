import { z } from "zod/v4";

/** Immigration status for benefit eligibility filtering */
export type ImmigrationStatus =
  | "citizen"
  | "permanent_resident"
  | "visa_holder"
  | "undocumented"
  | "unknown";

/** Religious finance preferences for filtering (e.g., halal, kosher) */
export interface ReligiousPreferences {
  readonly preferences: readonly string[];
}

/** A government benefit opportunity (SNAP, WIC, TANF, LIHEAP, etc.) */
export interface BenefitOpportunity {
  readonly programName: string;
  /** Decimal string — estimated monthly value */
  readonly estimatedMonthlyValue: string;
  readonly eligibilityRequirements: readonly string[];
  readonly applicationUrl: string;
  readonly requiresCitizenship: boolean;
  readonly requiresLegalResidency: boolean;
}

/** A better rate opportunity (savings accounts, CDs, etc.) */
export interface RateOpportunity {
  readonly institutionName: string;
  readonly productName: string;
  /** Decimal string — current rate as percentage */
  readonly currentRate: string;
  /** Decimal string — offered rate as percentage */
  readonly offeredRate: string;
  /** Decimal string — estimated annual savings */
  readonly estimatedAnnualSavings: string;
  readonly applicationUrl: string;
  readonly isAffiliate: boolean;
}

/** A refund opportunity (overcharges, billing errors, etc.) */
export interface RefundOpportunity {
  readonly merchantName: string;
  /** Decimal string — estimated refund amount */
  readonly estimatedRefundAmount: string;
  readonly reason: string;
  readonly transactionIds: readonly string[];
}

/** A cheaper alternative to a current service */
export interface AlternativeOpportunity {
  readonly currentService: string;
  readonly alternativeService: string;
  /** Decimal string — current monthly cost */
  readonly currentMonthlyCost: string;
  /** Decimal string — alternative monthly cost */
  readonly alternativeMonthlyCost: string;
  /** Decimal string — monthly savings */
  readonly monthlySavings: string;
  readonly switchUrl?: string;
  readonly isAffiliate: boolean;
}

/** Union of all opportunity types the Hunter can find */
export type Opportunity =
  | BenefitOpportunity
  | RateOpportunity
  | RefundOpportunity
  | AlternativeOpportunity;

/** Zod schema for BenefitOpportunity validation */
export const BenefitOpportunitySchema = z.object({
  programName: z.string().min(1),
  estimatedMonthlyValue: z.string().min(1),
  eligibilityRequirements: z.array(z.string()),
  applicationUrl: z.url(),
  requiresCitizenship: z.boolean(),
  requiresLegalResidency: z.boolean(),
});

/** Zod schema for ImmigrationStatus validation */
export const ImmigrationStatusSchema = z.enum([
  "citizen",
  "permanent_resident",
  "visa_holder",
  "undocumented",
  "unknown",
]);
