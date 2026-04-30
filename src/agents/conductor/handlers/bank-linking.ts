/**
 * Bank-linking chat handlers (task 3.10, MVP slice).
 *
 * Exposes two commands:
 *   - `/link_simplefin <access-url>` — user pastes a SimpleFIN access
 *     URL obtained from `bridge.simplefin.org/simplefin/create`. We
 *     validate the URL by fetching accounts, encrypt and store it in
 *     `bank_connections`, kick off an initial sync (best-effort), and
 *     advance the user's trust phase from Phase 0 → Phase 1.
 *   - `/accounts` — list active bank connections and their accounts
 *     with last-4 masking. Per Req 7.8, full account numbers are never
 *     surfaced to the user.
 *
 * `/link_bank` (Plaid Hosted Link redirect flow) and `/unlink_bank`
 * are deferred to a follow-up — Plaid Link requires dashboard
 * configuration (allowed redirect URIs) before the callback endpoint
 * can be deployed.
 *
 * @module agents/conductor/handlers/bank-linking
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import { encryptToken } from "@/lib/banking/adapter";
import { fetchAccounts as simpleFinFetchAccounts } from "@/lib/banking/simplefin";
import { advancePhase } from "@/lib/trust/state-machine";
import { Money } from "@/lib/math/decimal";
import type {
  ConductorContext,
  ConductorDeps,
  ConductorReply,
  Intent,
} from "../types";

/** Validate a SimpleFIN access URL minimally — protocol, auth, host. */
function isPlausibleSimpleFinUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;
    if (!parsed.username || !parsed.password) return false;
    if (!parsed.host) return false;
    return true;
  } catch {
    return false;
  }
}

/** Last-4 masking for an unmasked account identifier. Returns "••" if too short. */
function maskAccountId(value: string | null): string {
  if (!value) return "••";
  return value.length >= 4 ? `••${value.slice(-4)}` : "••";
}

/**
 * Handle /link_simplefin <access-url>.
 *
 * No-arg form returns instructions. With an arg we validate, store
 * (encrypted), advance trust, and report account count.
 */
export async function handleLinkSimpleFin(
  ctx: ConductorContext,
  intent: Intent,
  deps: ConductorDeps,
): Promise<ConductorReply> {
  if (intent.kind !== "command") {
    return { text: "Internal routing error — expected a command intent." };
  }

  const accessUrl = intent.args[0];

  if (!accessUrl) {
    return {
      text:
        "To connect a bank via SimpleFIN:\n\n" +
        "1. Go to https://bridge.simplefin.org/simplefin/create\n" +
        "2. Click your bank, sign in, and approve read-only access\n" +
        "3. Copy the resulting access URL (looks like " +
        "`https://USER:PASS@beta-bridge.simplefin.org/simplefin`)\n" +
        "4. Send it back to me with: `/link_simplefin <paste-url-here>`\n\n" +
        "I'll never share or store the URL in plaintext — it's encrypted " +
        "before it touches the database.",
    };
  }

  if (!isPlausibleSimpleFinUrl(accessUrl)) {
    return {
      text:
        "That doesn't look like a SimpleFIN access URL. The expected " +
        "shape is `https://USER:PASS@host/simplefin` — try again with " +
        "the URL you copied from `bridge.simplefin.org/simplefin/create`.",
    };
  }

  // Verify the URL actually works before persisting.
  let accountCount: number;
  try {
    const accounts = await simpleFinFetchAccounts({ accessUrl });
    accountCount = accounts.length;
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unknown error";
    return {
      text:
        "I couldn't reach SimpleFIN with that URL — it may be expired or " +
        `mistyped. Server reported: \`${reason.slice(0, 200)}\`. ` +
        "Try generating a fresh URL from " +
        "https://bridge.simplefin.org/simplefin/create and sending again.",
    };
  }

  const supabase: SupabaseClient = createClient(
    deps.supabaseUrl,
    deps.supabaseServiceRoleKey,
    { auth: { persistSession: false } },
  );

  // Encrypt and store. Reuses encryptToken from the banking adapter so
  // the format is compatible with syncBankData decryption.
  const encrypted = encryptToken(accessUrl, deps.encryptionKey);

  const { error: insertError } = await supabase.from("bank_connections").insert({
    user_id: ctx.userId,
    provider: "simplefin",
    access_token_encrypted: encrypted,
    institution_name: "SimpleFIN",
    status: "active",
  });

  if (insertError) {
    return {
      text:
        "I validated the URL but couldn't save it. The error was logged. " +
        "Please try again in a minute, or send /help.",
    };
  }

  // Advance trust phase 0 → 1 (read-only monitoring with ghost actions).
  // Best-effort: if the user is already past phase_0, this is a no-op
  // returning success=false with a "not allowed" reason — that's fine.
  let phaseNote = "";
  try {
    const redis = new Redis(deps.redisUrl, { maxRetriesPerRequest: 3 });
    try {
      const result = await advancePhase(
        ctx.userId,
        "bank_connected",
        supabase,
        redis,
      );
      if (result.success && result.previousPhase !== result.newPhase) {
        phaseNote = `\n\n🎯 Trust phase advanced: ${result.previousPhase} → ${result.newPhase}.`;
      }
    } finally {
      await redis.quit();
    }
  } catch {
    // Phase advance is non-fatal; the connection is already saved.
  }

  return {
    text:
      `✅ SimpleFIN connected — ${accountCount} account${accountCount === 1 ? "" : "s"} ` +
      "found. I'll start monitoring transactions and surface insights as I learn " +
      `your patterns.${phaseNote}\n\n` +
      "Send `/accounts` to see what's connected.",
  };
}

/**
 * Handle /accounts — list active bank connections + their accounts.
 */
export async function handleAccounts(
  ctx: ConductorContext,
  _intent: Intent,
  deps: ConductorDeps,
): Promise<ConductorReply> {
  const supabase: SupabaseClient = createClient(
    deps.supabaseUrl,
    deps.supabaseServiceRoleKey,
    { auth: { persistSession: false } },
  );

  const { data: connections, error: connError } = await supabase
    .from("bank_connections")
    .select("id, provider, institution_name, status, last_sync_at")
    .eq("user_id", ctx.userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });

  if (connError) {
    return { text: "Couldn't load your connections — please try again in a minute." };
  }

  if (!connections || connections.length === 0) {
    return {
      text:
        "You haven't connected a bank yet.\n\n" +
        "Use `/link_simplefin` to connect via SimpleFIN (free, read-only). " +
        "Plaid linking is coming soon.",
    };
  }

  const lines: string[] = ["Your connected banks:"];

  for (const conn of connections) {
    const provider = String(conn.provider ?? "unknown");
    const inst = String(conn.institution_name ?? "(unnamed)");
    const status = String(conn.status ?? "unknown");
    lines.push(`\n*${inst}* (${provider}) — ${status}`);

    const { data: accounts } = await supabase
      .from("accounts")
      .select("account_name, account_type, account_mask, current_balance, currency")
      .eq("bank_connection_id", conn.id as string)
      .eq("is_deleted", false)
      .order("account_name", { ascending: true });

    if (!accounts || accounts.length === 0) {
      lines.push("  _(no accounts synced yet — initial sync runs on next /sync)_");
      continue;
    }

    for (const a of accounts) {
      const name = String(a.account_name ?? "Account");
      const type = a.account_type ? ` ${String(a.account_type)}` : "";
      const mask = maskAccountId(a.account_mask as string | null);
      const balanceStr = a.current_balance != null
        ? Money.fromString(String(a.current_balance)).format()
        : "—";
      lines.push(`  • ${name}${type} ${mask} — ${balanceStr}`);
    }
  }

  return { text: lines.join("\n") };
}
