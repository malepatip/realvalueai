/**
 * SimpleFIN Webhook Handler
 *
 * Receives SimpleFIN webhook notifications for account updates
 * and connection errors.
 *
 * @module api/webhooks/simplefin
 */

import { NextRequest, NextResponse } from "next/server";
import { SimpleFinWebhookSchema } from "@/lib/banking/types";
import { createServerClient } from "@/lib/supabase/client";
import { getEnv } from "@/lib/env";

/**
 * POST /api/webhooks/simplefin
 *
 * SimpleFIN sends webhook notifications here for account updates
 * and connection status changes.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const env = getEnv();

    // Parse and validate the webhook body
    const rawBody: unknown = await request.json();
    const parseResult = SimpleFinWebhookSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    const webhook = parseResult.data;
    const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Log the webhook event
    await supabase.from("agent_event_logs").insert({
      agent: "banking",
      event_type: `simplefin_${webhook.event}`.toLowerCase(),
      payload: {
        event: webhook.event,
        connection_id: webhook.connection_id,
        has_error: webhook.error != null,
      },
    });

    // Handle different event types
    switch (webhook.event) {
      case "accounts_updated":
      case "transactions_available": {
        // Mark SimpleFIN connections as needing re-sync
        if (webhook.connection_id) {
          await supabase
            .from("bank_connections")
            .update({ updated_at: new Date().toISOString() })
            .eq("institution_id", webhook.connection_id)
            .eq("provider", "simplefin")
            .eq("is_deleted", false);
        }
        break;
      }
      case "connection_error": {
        if (webhook.connection_id) {
          await supabase
            .from("bank_connections")
            .update({
              status: "error",
              updated_at: new Date().toISOString(),
            })
            .eq("institution_id", webhook.connection_id)
            .eq("provider", "simplefin")
            .eq("is_deleted", false);
        }
        break;
      }
      case "connection_disconnected": {
        if (webhook.connection_id) {
          await supabase
            .from("bank_connections")
            .update({
              status: "disconnected",
              updated_at: new Date().toISOString(),
            })
            .eq("institution_id", webhook.connection_id)
            .eq("provider", "simplefin")
            .eq("is_deleted", false);
        }
        break;
      }
      default:
        // Acknowledge unknown events silently
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Always return 200 to prevent retry storms
    console.error(
      "SimpleFIN webhook error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json({ ok: true });
  }
}
