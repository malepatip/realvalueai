/**
 * /aha chat handler — the curated activation surface.
 *
 * Scope (founder reframe, 2026-05-03): /aha is the *emotional payoff*
 * companion to /sync. /sync is plumbing; /aha is the friend-text-message
 * that says "I found you something." Never a list, never a breakdown,
 * never a categorized table. One curated insight per invocation, ranked
 * by user impact.
 *
 * Today the only signal source wired up is the unused-subscription
 * detector. Future detectors (overdraft prevention, found money,
 * paycheck cycle saves) will plug in here as additional candidates and
 * the ranker will pick the single highest-impact one to surface.
 *
 * Architecture invariant: this handler does not run a sync. It reads
 * already-synced transactions. If there's no data yet, it nudges the
 * user to `/sync` or `/link_bank` rather than silently doing the work
 * — the founder explicitly wants /aha to be cheap and snappy, not a
 * 20-second silent wait on every invocation.
 *
 * @module agents/conductor/handlers/aha
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { detectRecurringCharges } from "@/agents/watcher/recurring-detector";
import { detectUnusedSubscriptions } from "@/agents/watcher/detectors/unused-subscription";
import { Money } from "@/lib/math/decimal";
import type { CategorizedTransaction, Insight } from "@/types/watcher";
import type {
  ConductorContext,
  ConductorDeps,
  ConductorReply,
} from "../types";

const LOOKBACK_DAYS = 90;

interface DbTransactionRow {
  readonly id: string;
  readonly merchant_name: string | null;
  readonly merchant_category: string | null;
  readonly category_rule_matched: string | null;
  readonly category_confidence: string | number | null;
  readonly amount: string | number;
  readonly transaction_date: string;
}

function rowToCategorized(row: DbTransactionRow): CategorizedTransaction {
  return {
    transactionId: row.id,
    merchantName: row.merchant_name ?? "(unknown)",
    merchantCategory: row.merchant_category ?? "uncategorized",
    categoryConfidence:
      row.category_confidence !== null ? Number(row.category_confidence) : 0,
    amount: String(row.amount),
    transactionDate: row.transaction_date,
  };
}

/**
 * Pure ranking function — exported for unit tests. Takes the full
 * candidate insight pool and picks the single insight to surface.
 *
 * Today the pool is just unused-sub insights, already pre-sorted by
 * monthly cost descending by `detectUnusedSubscriptions`. As more
 * detectors land, this function gains weighting logic (action-taken
 * insights beat opportunity insights beat heads-up insights, per the
 * priority order in `project_sync_aha_architecture_split.md`).
 */
export function pickAhaInsight(
  unusedSubs: ReadonlyArray<Insight>,
): Insight | null {
  return unusedSubs[0] ?? null;
}

/**
 * Render a single insight in friend-text-message register.
 *
 * Deliberately NOT a list, NOT a breakdown. One observation, one
 * dollar figure framed as a win-to-be-claimed, one offered next step.
 * Backticks wrap the merchant name (Telegram Markdown gotcha — see
 * handlers/help.ts).
 */
export function renderUnusedSubAha(insight: Insight): string {
  const merchant = insight.merchantName ?? "a subscription";
  const monthly = insight.amount
    ? Money.fromString(insight.amount).format()
    : "?";
  const days = insight.metadata["daysSinceUsage"] as number | undefined;

  const dayPhrase =
    days !== undefined ? `${days} days` : "weeks";

  return (
    `👀 Heads up — \`${merchant}\` is still charging you ` +
    `*${monthly}/mo* and you haven't used it in ${dayPhrase}.\n\n` +
    "Want me to cancel it? Subscription cancellation lands shortly; " +
    "until then this is a flag you can act on yourself."
  );
}

/**
 * Friendly fallback when no insight qualifies. The MVP target user
 * already gets enough negative-framed money messaging — silence here
 * should still feel like a win, not a shrug.
 */
export function renderEmptyAha(): string {
  return (
    "All clear right now — no silent subscriptions or surprise charges " +
    "in your accounts. I'll keep an eye out and ping you when something " +
    "changes."
  );
}

function renderNoDataAha(): string {
  return (
    "Nothing for me to look at yet. Run `/sync` to pull fresh data, or " +
    "`/link_bank` if you haven't connected an account."
  );
}

export async function handleAha(
  ctx: ConductorContext,
  _intent: unknown,
  deps: ConductorDeps,
): Promise<ConductorReply> {
  const supabase: SupabaseClient = createClient(
    deps.supabaseUrl,
    deps.supabaseServiceRoleKey,
    { auth: { persistSession: false } },
  );

  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - LOOKBACK_DAYS);
  const lookbackIso = lookbackDate.toISOString().split("T")[0];

  const { data: txnRows, error: txnError } = await supabase
    .from("transactions")
    .select(
      "id, merchant_name, merchant_category, category_rule_matched, category_confidence, amount, transaction_date",
    )
    .eq("user_id", ctx.userId)
    .eq("is_deleted", false)
    .gte("transaction_date", lookbackIso)
    .order("transaction_date", { ascending: true });

  if (txnError) {
    console.error("/aha — transactions query failed:", txnError.message);
    return {
      text: "Couldn't read your transactions just now. Try `/aha` again in a minute.",
    };
  }

  const txns: DbTransactionRow[] = (txnRows ?? []) as DbTransactionRow[];

  if (txns.length === 0) {
    return { text: renderNoDataAha() };
  }

  const categorized = txns.map(rowToCategorized);
  const charges = detectRecurringCharges(ctx.userId, categorized);

  // Outflows only — Plaid + SimpleFIN encode money leaving the account
  // as NEGATIVE. Recurring inflows (payroll, transfers in) match the
  // cadence detector but aren't subscriptions.
  const outflows = charges.filter((c) => {
    try {
      return Money.fromString(c.amount).isNegative();
    } catch {
      return false;
    }
  });

  const insights = detectUnusedSubscriptions(outflows);
  const picked = pickAhaInsight(insights);

  if (!picked) {
    return { text: renderEmptyAha() };
  }

  return { text: renderUnusedSubAha(picked) };
}
