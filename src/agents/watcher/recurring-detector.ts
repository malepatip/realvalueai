/**
 * Recurring charge detection engine.
 *
 * Groups transactions by merchant, analyzes amount + frequency patterns,
 * and identifies weekly/biweekly/monthly/quarterly/annual recurring charges.
 *
 * All monetary calculations use the Money class — NEVER IEEE 754 floats.
 */

import { v4 as uuidv4 } from "uuid";
import { Money } from "@/lib/math/decimal";
import type { CategorizedTransaction, RecurringCharge, RecurringFrequency } from "@/types/watcher";

/** Frequency detection thresholds (in days) */
const FREQUENCY_RANGES: ReadonlyArray<{
  readonly frequency: RecurringFrequency;
  readonly minDays: number;
  readonly maxDays: number;
  readonly label: string;
}> = [
  { frequency: "weekly", minDays: 5, maxDays: 9, label: "Weekly" },
  { frequency: "biweekly", minDays: 12, maxDays: 17, label: "Biweekly" },
  { frequency: "monthly", minDays: 26, maxDays: 35, label: "Monthly" },
  { frequency: "quarterly", minDays: 85, maxDays: 100, label: "Quarterly" },
  { frequency: "annual", minDays: 350, maxDays: 380, label: "Annual" },
];

/** Minimum number of occurrences to consider a pattern recurring */
const MIN_OCCURRENCES = 2;

/** Days since last usage before marking a subscription as "unused" */
const UNUSED_THRESHOLD_DAYS = 45;

/**
 * Detect recurring charges from a set of categorized transactions.
 *
 * Algorithm:
 * 1. Group transactions by normalized merchant name
 * 2. For each merchant group with >= MIN_OCCURRENCES transactions:
 *    a. Sort by date
 *    b. Compute intervals between consecutive transactions
 *    c. Find the median interval
 *    d. Match median interval to a known frequency
 * 3. Build RecurringCharge records with amount, frequency, and usage tracking
 */
export function detectRecurringCharges(
  _userId: string,
  transactions: readonly CategorizedTransaction[],
  currentDate?: string,
): RecurringCharge[] {
  const now = currentDate ? new Date(currentDate) : new Date();
  const grouped = groupByMerchant(transactions);
  const results: RecurringCharge[] = [];

  for (const [merchantName, txs] of grouped) {
    if (txs.length < MIN_OCCURRENCES) continue;

    // Sort by transaction date ascending
    const sorted = [...txs].sort(
      (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime(),
    );

    // Compute intervals between consecutive transactions (in days)
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]!.transactionDate);
      const curr = new Date(sorted[i]!.transactionDate);
      const diffMs = curr.getTime() - prev.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      intervals.push(diffDays);
    }

    if (intervals.length === 0) continue;

    // Find median interval
    const medianInterval = computeMedian(intervals);
    const frequency = matchFrequency(medianInterval);

    if (!frequency) continue;

    // Use Money for all amount calculations
    const latestTx = sorted[sorted.length - 1]!;
    const currentAmount = Money.fromString(latestTx.amount);

    // Previous amount (second-to-last if available)
    const previousAmount =
      sorted.length >= 2
        ? Money.fromString(sorted[sorted.length - 2]!.amount)
        : undefined;

    // Calculate days since last charge
    const lastChargedDate = latestTx.transactionDate;
    const daysSinceCharge = Math.round(
      (now.getTime() - new Date(lastChargedDate).getTime()) / (1000 * 60 * 60 * 24),
    );

    // Estimate next expected date
    const nextExpectedDate = estimateNextDate(lastChargedDate, frequency);

    // Determine status based on usage
    const status = daysSinceCharge > UNUSED_THRESHOLD_DAYS ? "unused" as const : "active" as const;

    results.push({
      id: uuidv4(),
      merchantName,
      amount: currentAmount.toNumericString(),
      previousAmount: previousAmount?.toNumericString(),
      frequency,
      nextExpectedDate,
      lastChargedDate,
      lastUsageDate: lastChargedDate,
      daysSinceUsage: daysSinceCharge,
      isTrial: false,
      status,
    });
  }

  return results;
}

/**
 * Group transactions by normalized merchant name.
 * Normalization: lowercase, trim, collapse whitespace.
 */
function groupByMerchant(
  transactions: readonly CategorizedTransaction[],
): Map<string, CategorizedTransaction[]> {
  const groups = new Map<string, CategorizedTransaction[]>();

  for (const tx of transactions) {
    const key = tx.merchantName.toLowerCase().trim().replace(/\s+/g, " ");
    const existing = groups.get(key);
    if (existing) {
      existing.push(tx);
    } else {
      groups.set(key, [tx]);
    }
  }

  return groups;
}

/**
 * Compute the median of a sorted array of numbers.
 */
function computeMedian(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }

  return sorted[mid] ?? 0;
}

/**
 * Match a median interval (in days) to a known recurring frequency.
 * Returns null if no frequency matches.
 */
function matchFrequency(medianDays: number): RecurringFrequency | null {
  for (const range of FREQUENCY_RANGES) {
    if (medianDays >= range.minDays && medianDays <= range.maxDays) {
      return range.frequency;
    }
  }
  return null;
}

/**
 * Estimate the next expected charge date based on the last charge date and frequency.
 */
function estimateNextDate(
  lastChargedDate: string,
  frequency: RecurringFrequency,
): string {
  const date = new Date(lastChargedDate);

  switch (frequency) {
    case "weekly":
      date.setDate(date.getDate() + 7);
      break;
    case "biweekly":
      date.setDate(date.getDate() + 14);
      break;
    case "monthly":
      date.setMonth(date.getMonth() + 1);
      break;
    case "quarterly":
      date.setMonth(date.getMonth() + 3);
      break;
    case "annual":
      date.setFullYear(date.getFullYear() + 1);
      break;
  }

  return date.toISOString().split("T")[0]!;
}

export { MIN_OCCURRENCES, UNUSED_THRESHOLD_DAYS, FREQUENCY_RANGES };
