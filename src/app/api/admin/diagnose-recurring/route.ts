/**
 * Temporary diagnostic endpoint for the /sync recurring-detector.
 *
 * Investigates "why /sync returned 0 unused subs" by dumping:
 *   - the user record
 *   - bank_connection rows
 *   - transaction count + date range
 *   - merchant histogram (after the recurring-detector's normalization)
 *   - all candidate groups with median interval, matched frequency,
 *     last date, days-since-last
 *   - the recurring patterns the detector would emit + their statuses
 *
 * Pure read-only. Picks the most-recently-created user with a
 * non-null telegram_user_id (single-user test environment); pass
 * `?telegram_user_id=...` to override.
 *
 * **Remove this endpoint** once we've debugged the data shape and
 * fixed the detector — it's a temporary scaffold, not a permanent
 * surface. Tracked as a TODO in memory.
 *
 * @module api/admin/diagnose-recurring
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

interface FreqRange {
  readonly frequency: string;
  readonly minDays: number;
  readonly maxDays: number;
}

const FREQUENCY_RANGES: ReadonlyArray<FreqRange> = [
  { frequency: "weekly", minDays: 5, maxDays: 9 },
  { frequency: "biweekly", minDays: 12, maxDays: 17 },
  { frequency: "monthly", minDays: 26, maxDays: 35 },
  { frequency: "quarterly", minDays: 85, maxDays: 100 },
  { frequency: "annual", minDays: 350, maxDays: 380 },
];

function normalize(name: string | null): string {
  return (name ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  if (s.length === 0) return 0;
  return s.length % 2 === 0 ? ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2 : (s[m] ?? 0);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = getEnv();
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const telegramUserId = request.nextUrl.searchParams.get("telegram_user_id");

  // 1. Find the user
  let userQuery = supabase
    .from("users")
    .select("id, phone_number, telegram_user_id, display_name, trust_phase, created_at");
  if (telegramUserId) {
    userQuery = userQuery.eq("telegram_user_id", telegramUserId);
  } else {
    userQuery = userQuery.not("telegram_user_id", "is", null).order("created_at", { ascending: false }).limit(1);
  }
  const { data: userRows } = await userQuery;
  const user = userRows?.[0];
  if (!user) {
    return NextResponse.json({ error: "no user found" }, { status: 404 });
  }

  const userId = user.id as string;

  // 2. Bank connections
  const { data: connections } = await supabase
    .from("bank_connections")
    .select("id, provider, institution_name, status, last_sync_at, created_at")
    .eq("user_id", userId)
    .eq("is_deleted", false);

  // 3. Transactions, last 90 days
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - 90);
  const lookbackIso = lookbackDate.toISOString().split("T")[0]!;

  const { data: txns } = await supabase
    .from("transactions")
    .select("id, merchant_name, description, amount, transaction_date")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .gte("transaction_date", lookbackIso)
    .order("transaction_date", { ascending: true });

  const transactions = (txns ?? []) as Array<{
    id: string;
    merchant_name: string | null;
    description: string | null;
    amount: string | number;
    transaction_date: string;
  }>;

  // 4. Merchant histogram — using the same normalize() as the detector
  const groups = new Map<string, typeof transactions>();
  for (const tx of transactions) {
    const key = normalize(tx.merchant_name);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(tx);
    groups.set(key, arr);
  }

  // 5. Compute candidate stats for every group
  const today = new Date();
  const candidates: Array<{
    merchant: string;
    occurrences: number;
    medianInterval: number;
    intervals: number[];
    matched: string | null;
    firstDate: string;
    lastDate: string;
    daysSinceLast: number;
    lastAmount: number;
    sampleRawNames: string[];
  }> = [];

  for (const [merchant, items] of groups) {
    if (items.length < 2) continue;
    const sorted = [...items].sort(
      (a, b) =>
        new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime(),
    );
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const days = Math.round(
        (new Date(sorted[i]!.transaction_date).getTime() -
          new Date(sorted[i - 1]!.transaction_date).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      intervals.push(days);
    }
    const med = median(intervals);
    const matched = FREQUENCY_RANGES.find(
      (r) => med >= r.minDays && med <= r.maxDays,
    );
    const lastDate = sorted[sorted.length - 1]!.transaction_date;
    const daysSinceLast = Math.round(
      (today.getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24),
    );

    candidates.push({
      merchant,
      occurrences: items.length,
      medianInterval: med,
      intervals: intervals.slice(0, 10),
      matched: matched?.frequency ?? null,
      firstDate: sorted[0]!.transaction_date,
      lastDate,
      daysSinceLast,
      lastAmount: Number(sorted[sorted.length - 1]!.amount),
      sampleRawNames: [...new Set(items.map((t) => t.merchant_name ?? ""))].slice(0, 5),
    });
  }

  candidates.sort((a, b) => b.occurrences - a.occurrences);

  const recurring = candidates.filter((c) => c.matched);

  return NextResponse.json({
    user: {
      id: userId,
      telegram_user_id: user.telegram_user_id,
      display_name: user.display_name,
      trust_phase: user.trust_phase,
    },
    connections,
    transactions: {
      count: transactions.length,
      earliest: transactions[0]?.transaction_date,
      latest: transactions[transactions.length - 1]?.transaction_date,
      lookbackFrom: lookbackIso,
    },
    merchants: {
      uniqueGroups: groups.size,
      groupsWithMultipleOccurrences: candidates.length,
      groupsThatMatchAFrequency: recurring.length,
    },
    topCandidatesByOccurrence: candidates.slice(0, 30),
    recurringPatternsDetected: recurring.map((r) => ({
      merchant: r.merchant,
      frequency: r.matched,
      lastAmount: r.lastAmount,
      daysSinceLast: r.daysSinceLast,
      status: r.daysSinceLast > 45 ? "unused" : "active",
      occurrences: r.occurrences,
      sampleRawNames: r.sampleRawNames,
    })),
  });
}
