/**
 * Plaid Webhook Handler
 *
 * Receives Plaid webhook notifications for transaction updates,
 * item errors, and other events. Validates the payload and
 * triggers appropriate sync or error handling.
 *
 * @module api/webhooks/plaid
 */

import { NextRequest, NextResponse } from "next/server";
import { PlaidWebhookSchema } from "@/lib/banking/types";
import { createServerClient } from "@/lib/supabase/client";
import { getEnv } from "@/lib/env";

/**
 * POST /api/webhooks/plaid
 *
 * Plaid sends webhook notifications here for transaction updates,
 * item errors, and other events.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const env = getEnv();

    // Parse and validate the webhook body
    const rawBody: unknown = await request.json();
    const parseResult = PlaidWebhookSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    const webhook = parseResult.data;
    const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Log the webhook event
    await supabase.from("agent_event_logs").insert({
      agent: "banking",
      event_type: `plaid_${webhook.webhook_type}_${webhook.webhook_code}`.toLowerCase(),
      payload: {
        webhook_type: webhook.webhook_type,
        webhook_code: webhook.webhook_code,
        item_id: webhook.item_id,
        has_error: webhook.error != null,
      },
    });

    // Handle different webhook types
    switch (webhook.webhook_type) {
      case "TRANSACTIONS": {
        await handleTransactionWebhook(supabase, webhook);
        break;
      }
      case "ITEM": {
        await handleItemWebhook(supabase, webhook);
        break;
      }
      default:
        // Acknowledge unknown webhook types silently
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Always return 200 to prevent Plaid retry storms
    console.error(
      "Plaid webhook error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json({ ok: true });
  }
}

/**
 * Handle TRANSACTIONS webhook events.
 * Marks the connection as needing a sync.
 */
async function handleTransactionWebhook(
  supabase: ReturnType<typeof createServerClient>,
  webhook: { webhook_code: string; item_id?: string },
): Promise<void> {
  if (!webhook.item_id) return;

  switch (webhook.webhook_code) {
    case "SYNC_UPDATES_AVAILABLE":
    case "INITIAL_UPDATE":
    case "HISTORICAL_UPDATE":
    case "DEFAULT_UPDATE": {
      // Mark the connection's last_sync_at as stale to trigger re-sync
      // The actual sync is handled by the scheduled sync job
      await supabase
        .from("bank_connections")
        .update({ updated_at: new Date().toISOString() })
        .eq("institution_id", webhook.item_id)
        .eq("provider", "plaid")
        .eq("is_deleted", false);
      break;
    }
    case "TRANSACTIONS_REMOVED": {
      // Soft-delete removed transactions will be handled during next sync
      break;
    }
    default:
      break;
  }
}

/**
 * Handle ITEM webhook events (errors, pending expiration).
 */
async function handleItemWebhook(
  supabase: ReturnType<typeof createServerClient>,
  webhook: { webhook_code: string; item_id?: string; error?: { error_type: string; error_code: string; error_message: string } | null },
): Promise<void> {
  if (!webhook.item_id) return;

  switch (webhook.webhook_code) {
    case "ERROR": {
      // Mark the connection as errored
      await supabase
        .from("bank_connections")
        .update({
          status: "error",
          updated_at: new Date().toISOString(),
        })
        .eq("institution_id", webhook.item_id)
        .eq("provider", "plaid")
        .eq("is_deleted", false);
      break;
    }
    case "PENDING_EXPIRATION": {
      // Connection will expire soon — mark as disconnected
      await supabase
        .from("bank_connections")
        .update({
          status: "disconnected",
          updated_at: new Date().toISOString(),
        })
        .eq("institution_id", webhook.item_id)
        .eq("provider", "plaid")
        .eq("is_deleted", false);
      break;
    }
    default:
      break;
  }
}
