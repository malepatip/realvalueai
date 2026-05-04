/**
 * /sync chat handler — pull bank data, detect recurring + unused subs.
 *
 * This is the user-facing entry point for the "Holy Shit Moment"
 * (Req 11.4): user types /sync, the bot pulls fresh transactions
 * from every linked bank, identifies recurring charges, and surfaces
 * any subscription that hasn't been used in 45+ days.
 *
 * For the MVP slice we run the full pipeline in-memory each time:
 *   1. syncBankData() — pulls transactions + upserts into Supabase
 *   2. Query last 90 days of transactions for the user
 *   3. detectRecurringCharges() (pure)
 *   4. detectUnusedSubscriptions() (pure)
 *   5. Format reply
 *
 * Persisting recurring_charges to the DB and incremental detection
 * are follow-ups (task 4.4 morning briefing pipeline).
 *
 * @module agents/conductor/handlers/sync
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { syncBankData } from "@/lib/banking/adapter";
import { detectRecurringCharges } from "@/agents/watcher/recurring-detector";
import { detectUnusedSubscriptions } from "@/agents/watcher/detectors/unused-subscription";
import { Money } from "@/lib/math/decimal";
import type {
  CategorizedTransaction,
  Insight,
} from "@/types/watcher";
import type {
  ConductorContext,
  ConductorDeps,
  ConductorReply,
} from "../types";

/** Look-back window for the recurring-detection pass. */
const LOOKBACK_DAYS = 90;

/** Max insights to surface in a single chat reply. */
const MAX_INSIGHTS_IN_REPLY = 10;

interface DbTransactionRow {
  readonly id: string;
  readonly merchant_name: string | null;
  readonly merchant_category: string | null;
  readonly category_rule_matched: string | null;
  readonly category_confidence: string | number | null;
  readonly amount: string | number;
  readonly transaction_date: string;
}

/**
 * Map a raw `transactions` row into the CategorizedTransaction shape
 * the recurring-detector expects. Fills in placeholder category data
 * since the categorizer pipeline (2.3) hasn't been wired into sync
 * yet — recurring detection only needs merchant/amount/date.
 */
function rowToCategorized(row: DbTransactionRow): CategorizedTransaction {
  const result: CategorizedTransaction = {
    transactionId: row.id,
    merchantName: row.merchant_name ?? "(unknown)",
    merchantCategory: row.merchant_category ?? "uncategorized",
    categoryConfidence:
      row.category_confidence !== null
        ? Number(row.category_confidence)
        : 0,
    amount: String(row.amount),
    transactionDate: row.transaction_date,
  };
  return result;
}

interface SyncDiagnostics {
  readonly transactionCount: number;
  /** Recurring outflow charges only (incoming payroll/transfers excluded). */
  readonly recurringOutflowCount: number;
  /** Of the outflows: how many are still actively recurring (last seen <45d ago). */
  readonly recurringActiveCount: number;
  /** Of the outflows: how many have gone silent for 45+ days. */
  readonly recurringUnusedCount: number;
  readonly topRecurring: ReadonlyArray<{
    merchant: string;
    frequency: string;
    amountFormatted: string;
    days: number;
    status: string;
  }>;
}

/**
 * Format a list of unused-sub insights into a chat-ready message.
 * Always wraps merchant names in backticks (per the Telegram-Markdown
 * gotcha documented in handlers/help.ts) so underscores in merchant
 * names don't break the message parser.
 *
 * When zero unused subs are found we still surface diagnostic counts
 * (transactions synced, recurring patterns detected) so the user can
 * see the pipeline ran. Otherwise "no unused subs" is indistinguishable
 * from "pipeline silently failed."
 */
function formatUnusedSubsReply(
  insights: ReadonlyArray<Insight>,
  diag: SyncDiagnostics,
): string {
  if (insights.length === 0) {
    const lines = [
      "✅ I scanned your accounts and didn't find any unused subscriptions yet.",
      "",
      `_Pipeline ran:_ ${diag.transactionCount} txns, ${diag.recurringOutflowCount} recurring outflow patterns detected ` +
        `(${diag.recurringActiveCount} still active, ${diag.recurringUnusedCount} silent 45+ days).`,
    ];
    if (diag.topRecurring.length > 0) {
      lines.push("", "Top recurring outflows I _did_ detect:");
      for (const r of diag.topRecurring) {
        lines.push(
          `• \`${r.merchant}\` — ${r.amountFormatted} ${r.frequency}, last ${r.days}d ago`,
        );
      }
    }
    lines.push(
      "",
      "Subs are flagged unused only after 45+ days with no charge. Run `/sync` again any time.",
    );
    return lines.join("\n");
  }

  const shown = insights.slice(0, MAX_INSIGHTS_IN_REPLY);
  let total = Money.fromString("0");
  for (const i of shown) {
    if (i.amount) {
      total = total.add(Money.fromString(i.amount));
    }
  }

  const lines: string[] = [
    `🔍 Found ${insights.length} subscription${insights.length === 1 ? "" : "s"} you haven't used in 45+ days.`,
    "",
    `Total monthly waste: *${total.format()}*`,
    "",
    "Top items:",
  ];

  for (const i of shown) {
    const days = i.metadata["daysSinceUsage"] as number | undefined;
    const monthly = i.amount
      ? Money.fromString(i.amount).format()
      : "?";
    const merchant = i.merchantName ?? "(unknown)";
    lines.push(`• \`${merchant}\` — ${monthly}/mo (unused ${days ?? "?"} days)`);
  }

  if (insights.length > shown.length) {
    lines.push(`...and ${insights.length - shown.length} more.`);
  }

  lines.push(
    "",
    `_Pipeline ran:_ ${diag.transactionCount} txns scanned, ${diag.recurringOutflowCount} recurring outflow patterns detected.`,
    "",
    "I can cancel these for you (coming in task 4.1 — Subscription Assassin). " +
      "For now, this is your shopping list of waste.",
  );
  return lines.join("\n");
}

export async function handleSync(
  ctx: ConductorContext,
  _intent: unknown,
  deps: ConductorDeps,
): Promise<ConductorReply> {
  const supabase: SupabaseClient = createClient(
    deps.supabaseUrl,
    deps.supabaseServiceRoleKey,
    { auth: { persistSession: false } },
  );

  // 1. Run sync against every active bank_connection.
  try {
    await syncBankData(ctx.userId, supabase, {
      plaidClientId: deps.plaidClientId,
      plaidSecret: deps.plaidSecret,
      encryptionKey: deps.encryptionKey,
      plaidEnvironment: deps.plaidEnv,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unknown";
    console.error("/sync — syncBankData failed:", reason);
    return {
      text:
        "I couldn't pull fresh data from your banks. Try `/sync` again " +
        "in a minute, or `/accounts` to see what's connected. " +
        `(\`${reason.slice(0, 200)}\`)`,
    };
  }

  // 2. Load the last 90 days of transactions for this user.
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
    console.error("/sync — transactions query failed:", txnError.message);
    return {
      text: "Pulled fresh data, but couldn't read it back. Try `/sync` again in a minute.",
    };
  }

  const txns: DbTransactionRow[] = (txnRows ?? []) as DbTransactionRow[];

  if (txns.length === 0) {
    return {
      text:
        "I synced your accounts but didn't find any transactions in the " +
        "last 90 days yet. If you just linked a bank via `/link_bank`, " +
        "Plaid sandbox returns no transactions by default — link a real " +
        "bank or your SimpleFIN account to see real data. " +
        "Try `/accounts` to see what's connected.",
    };
  }

  const categorized = txns.map(rowToCategorized);

  // 3. Run the recurring-detector (in-memory, pure).
  const charges = detectRecurringCharges(ctx.userId, categorized);

  // 4. Narrow to outflows only for the user-facing surface.
  //    Plaid + SimpleFIN both encode outgoing money as NEGATIVE
  //    amounts. Inflows (payroll, transfers in, refunds, interest
  //    income) cluster on positive cadences too — but calling those
  //    "subscriptions" or "recurring charges" in chat is misleading.
  //    The recurring-detector itself stays generic; this filter is
  //    presentation logic for /sync only.
  const outflows = charges.filter((c) => {
    try {
      return Money.fromString(c.amount).isNegative();
    } catch {
      return false;
    }
  });

  // 5. Run the unused-sub detector against outflows only.
  //    detectUnusedSubscriptions is now sign-agnostic (uses abs()),
  //    so passing the full charges list would also work — but we
  //    keep the user-facing scope tight to subscription-shaped
  //    things. Income that mysteriously goes silent for 45+ days
  //    isn't a "Cancel this!" prompt.
  const insights = detectUnusedSubscriptions(outflows);

  // 6. Build diagnostics — surface counts so "no unused subs" doesn't
  //    look indistinguishable from "pipeline broken."
  const activeCount = outflows.filter((c) => c.status === "active").length;
  const unusedCount = outflows.filter((c) => c.status === "unused").length;

  // Top 5 recurring outflows by absolute monthly-equivalent cost.
  const topRecurring = [...outflows]
    .sort((a, b) => {
      const aAbs = Money.fromString(a.amount).abs();
      const bAbs = Money.fromString(b.amount).abs();
      if (bAbs.isGreaterThan(aAbs)) return 1;
      if (aAbs.isGreaterThan(bAbs)) return -1;
      return 0;
    })
    .slice(0, 5)
    .map((c) => ({
      merchant: c.merchantName,
      frequency: c.frequency,
      amountFormatted: Money.fromString(c.amount).abs().format(),
      days: c.daysSinceUsage ?? 0,
      status: c.status,
    }));

  const diag: SyncDiagnostics = {
    transactionCount: txns.length,
    recurringOutflowCount: outflows.length,
    recurringActiveCount: activeCount,
    recurringUnusedCount: unusedCount,
    topRecurring,
  };

  // 7. Format reply.
  return { text: formatUnusedSubsReply(insights, diag) };
}
