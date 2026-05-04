/**
 * Unused subscription detector (task 3.1).
 *
 * Pure function: takes already-detected recurring charges and returns
 * insights for those marked unused (per Req 4.5 — no usage activity
 * for 45+ days). Caller is responsible for loading recurring_charges
 * from the database (or computing them in-memory via the recurring
 * detector).
 *
 * All monetary math uses the Money class — never IEEE 754 floats.
 *
 * @module agents/watcher/detectors/unused-subscription
 */

import { Money } from "@/lib/math/decimal";
import type {
  Insight,
  RecurringCharge,
  RecurringFrequency,
} from "@/types/watcher";

/** Days since last usage before a subscription is flagged as unused (Req 4.5). */
export const UNUSED_THRESHOLD_DAYS = 45;

/**
 * Approximate monthly multipliers to convert charge frequency to a
 * comparable per-month cost. Stored as decimal strings so Money keeps
 * exact arithmetic — no IEEE 754 anywhere.
 *
 * weekly:    365.25 / 12 / 7   ≈ 4.34524
 * biweekly:  365.25 / 12 / 14  ≈ 2.17262
 * monthly:   1
 * quarterly: 1/3               ≈ 0.33333
 * annual:    1/12              ≈ 0.08333
 */
const MONTHLY_MULTIPLIER: Readonly<Record<RecurringFrequency, string>> = {
  weekly: "4.34524",
  biweekly: "2.17262",
  monthly: "1",
  quarterly: "0.33333",
  annual: "0.08333",
};

/**
 * Convert a charge amount to its monthly equivalent.
 * E.g. a quarterly $30 charge → $10/month equivalent.
 */
export function monthlyEquivalent(
  amount: Money,
  frequency: RecurringFrequency,
): Money {
  const multiplier = MONTHLY_MULTIPLIER[frequency];
  return amount.multiply(multiplier);
}

/**
 * Detect unused subscriptions from a list of recurring charges.
 *
 * Filter rules:
 *   - status must be "active" or "unused" (skip cancelled / paused —
 *     the recurring-detector auto-flips a charge to "unused" when its
 *     most recent occurrence is older than 45 days, which is exactly
 *     the signal we want to surface)
 *   - daysSinceUsage must be ≥ UNUSED_THRESHOLD_DAYS (45)
 *   - amount must be non-zero
 *
 * Sign convention: Plaid + SimpleFIN return outflows as NEGATIVE
 * amounts. Earlier versions of this detector filtered with
 * `amount > 0` thinking they were skipping credits/refunds, which
 * silently dropped every real subscription. We now take abs() of
 * the amount so the detector works with either sign convention.
 *
 * Note: the spec wording (Req 4.5) talks about "active subscriptions
 * the user hasn't used in 45 days" — that's the long-term goal and
 * needs separate usage-event tracking (logins, app opens). Until that
 * exists, the recurring-detector's auto-`status: "unused"` flag IS
 * our usage-gap proxy: if charges have stopped appearing for 45+
 * days, the subscription is either silently cancelled or charging
 * less frequently than expected — both worth flagging.
 *
 * Returns one Insight per qualifying charge, sorted by monthly
 * equivalent cost descending so the biggest waste rises to the top.
 *
 * @param charges  - Recurring charges to evaluate
 * @param currentDate - ISO datetime stamped on each insight (defaults to now)
 * @returns Insights with type="unused_subscription" and metadata for routing
 */
export function detectUnusedSubscriptions(
  charges: ReadonlyArray<RecurringCharge>,
  currentDate?: string,
): Insight[] {
  const detectedAt = currentDate ?? new Date().toISOString();
  const candidates: { insight: Insight; monthlyCost: Money }[] = [];

  for (const charge of charges) {
    if (charge.status !== "active" && charge.status !== "unused") continue;
    const days = charge.daysSinceUsage ?? 0;
    if (days < UNUSED_THRESHOLD_DAYS) continue;

    const rawAmount = Money.fromString(charge.amount);
    if (rawAmount.isZero()) continue;
    const amount = rawAmount.abs();

    const monthly = monthlyEquivalent(amount, charge.frequency);

    const metadata: Record<string, unknown> = {
      chargeId: charge.id,
      frequency: charge.frequency,
      daysSinceUsage: days,
      chargeAmount: charge.amount,
      monthlyEquivalent: monthly.toNumericString(),
    };
    if (charge.lastUsageDate !== undefined) {
      metadata["lastUsageDate"] = charge.lastUsageDate;
    }
    if (charge.lastChargedDate !== undefined) {
      metadata["lastChargedDate"] = charge.lastChargedDate;
    }

    const insight: Insight = {
      type: "unused_subscription",
      urgency: "batched",
      merchantName: charge.merchantName,
      amount: monthly.toNumericString(),
      description:
        `${charge.merchantName} (${charge.frequency} ~${monthly.format()}/mo) ` +
        `— unused for ${days} days`,
      metadata,
      detectedAt,
    };

    candidates.push({ insight, monthlyCost: monthly });
  }

  // Sort by monthly cost descending — biggest waste first.
  candidates.sort((a, b) => {
    if (a.monthlyCost.isGreaterThan(b.monthlyCost)) return -1;
    if (b.monthlyCost.isGreaterThan(a.monthlyCost)) return 1;
    return 0;
  });

  return candidates.map((c) => c.insight);
}
