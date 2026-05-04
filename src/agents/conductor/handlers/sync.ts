/**
 * /sync chat handler — mechanical refresh only.
 *
 * Scope (founder reframe, 2026-05-03): /sync is the *plumbing* command.
 * It refreshes data from connected banks and acknowledges. It does NOT
 * surface insights, breakdowns, or detector output — that work moved to
 * /aha, the curated activation surface. See
 * `memory/project_sync_aha_architecture_split.md`.
 *
 * Output is one short, friend-text-flavored sentence with the count of
 * new transactions and accounts touched, plus a hand-off to /aha.
 *
 * @module agents/conductor/handlers/sync
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { syncBankData } from "@/lib/banking/adapter";
import type {
  ConductorContext,
  ConductorDeps,
  ConductorReply,
} from "../types";

export async function handleSync(
  _ctx: ConductorContext,
  _intent: unknown,
  deps: ConductorDeps,
): Promise<ConductorReply> {
  const supabase: SupabaseClient = createClient(
    deps.supabaseUrl,
    deps.supabaseServiceRoleKey,
    { auth: { persistSession: false } },
  );

  let summary;
  try {
    summary = await syncBankData(_ctx.userId, supabase, {
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

  // No active connections at all — nudge to /link_bank.
  if (
    summary.connectionsSynced === 0 &&
    summary.connectionsErrored === 0
  ) {
    return {
      text:
        "Nothing to sync yet — you haven't linked a bank. " +
        "Tap `/link_bank` and we'll get you set up in a minute.",
    };
  }

  // Sync hit at least one connection. Report counts honestly.
  const txnPart =
    summary.transactionsAdded === 0
      ? "no new transactions"
      : `${summary.transactionsAdded} new transaction${summary.transactionsAdded === 1 ? "" : "s"}`;

  const acctPart =
    summary.accountsTouched === 1
      ? "1 account"
      : `${summary.accountsTouched} accounts`;

  const lines = [`✅ Synced ${acctPart} — ${txnPart}.`];

  if (summary.connectionsErrored > 0) {
    lines.push(
      `_${summary.connectionsErrored} connection${summary.connectionsErrored === 1 ? "" : "s"} hit an error — I'll retry next sync._`,
    );
  }

  lines.push("", "Tap `/aha` to see what I found.");
  return { text: lines.join("\n") };
}
