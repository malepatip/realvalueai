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

/**
 * Format a list of unused-sub insights into a chat-ready message.
 * Always wraps merchant names in backticks (per the Telegram-Markdown
 * gotcha documented in handlers/help.ts) so underscores in merchant
 * names don't break the message parser.
 */
function formatUnusedSubsReply(insights: ReadonlyArray<Insight>): string {
  if (insights.length === 0) {
    return (
      "✅ I scanned your accounts and didn't find any unused subscriptions " +
      "(no recurring charges that have gone unused for 45+ days). " +
      "I'll keep watching — message `/sync` any time to re-scan."
    );
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

  // 4. Run the unused-sub detector (in-memory, pure).
  const insights = detectUnusedSubscriptions(charges);

  // 5. Format reply.
  return { text: formatUnusedSubsReply(insights) };
}
