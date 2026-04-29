/**
 * Telegram Webhook Handler
 *
 * Receives Telegram webhook updates, validates authenticity,
 * resolves or creates the user, logs the raw event, and enqueues
 * the message for async processing on the INBOUND BullMQ queue.
 *
 * @module api/webhooks/telegram
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import {
  parseTelegramUpdate,
  verifyTelegramSignature,
  parseCallbackAction,
} from "@/lib/channels/telegram-webhook";
import { createAgentMessage } from "@/lib/agents/protocol";
import { getQueue, QUEUE_NAMES } from "@/lib/redis/bullmq";
import { createServerClient } from "@/lib/supabase/client";
import { getEnv } from "@/lib/env";
import type { User } from "@/types/database";

/** Minimal Zod schema to ensure the body is a non-null object with update_id */
const TelegramUpdateBodySchema = z.object({
  update_id: z.number(),
}).passthrough();

/**
 * Look up a user by their Telegram user ID.
 * If no user exists, create one at Phase 0 with a placeholder phone number.
 */
async function resolveUser(
  telegramUserId: number,
  displayName: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<User> {
  const supabase = createServerClient(supabaseUrl, serviceRoleKey);
  const telegramIdStr = String(telegramUserId);

  // Look up existing user
  const { data: existing, error: lookupError } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_user_id", telegramIdStr)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`User lookup failed: ${lookupError.message}`);
  }

  if (existing) {
    return existing as User;
  }

  // Create new user at Phase 0
  const { data: created, error: createError } = await supabase
    .from("users")
    .insert({
      phone_number: `telegram:${telegramIdStr}`,
      telegram_user_id: telegramIdStr,
      display_name: displayName,
      trust_phase: "phase_0",
    })
    .select("*")
    .single();

  if (createError || !created) {
    throw new Error(`User creation failed: ${createError?.message ?? "no data returned"}`);
  }

  return created as User;
}

/**
 * Store the raw webhook update in the agent_event_logs table.
 */
async function logRawEvent(
  userId: string,
  eventType: string,
  payload: Record<string, unknown>,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<void> {
  const supabase = createServerClient(supabaseUrl, serviceRoleKey);

  const { error } = await supabase.from("agent_event_logs").insert({
    agent: "voice",
    event_type: eventType,
    user_id: userId,
    payload,
  });

  if (error) {
    // Log failure but don't block the webhook response
    console.error("Failed to log raw event:", error.message);
  }
}

/**
 * POST /api/webhooks/telegram
 *
 * Telegram sends updates here. We validate, parse, resolve the user,
 * log the event, enqueue for processing, and return 200 immediately.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const env = getEnv();

    // 1. Verify webhook signature
    // Telegram echoes the `secret_token` from setWebhook in this header.
    // We use a dedicated TELEGRAM_WEBHOOK_SECRET (not the bot token) because
    // Telegram restricts secret_token to [A-Za-z0-9_-] — bot tokens contain ":".
    const headerSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (!verifyTelegramSignature(headerSecret, env.TELEGRAM_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse and validate body
    const rawBody: unknown = await request.json();
    const bodyResult = TelegramUpdateBodySchema.safeParse(rawBody);
    if (!bodyResult.success) {
      return NextResponse.json({ error: "Invalid update body" }, { status: 400 });
    }
    const body = bodyResult.data as Record<string, unknown>;

    // 3. Parse the Telegram update
    const parsed = parseTelegramUpdate(body);
    if (!parsed) {
      // Unsupported update type (e.g., edited_message, channel_post) — acknowledge silently
      return NextResponse.json({ ok: true });
    }

    // 4. Resolve or create user
    const displayName = [parsed.user.firstName, parsed.user.lastName]
      .filter(Boolean)
      .join(" ");

    const user = await resolveUser(
      parsed.user.id,
      displayName,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
    );

    // 5. Log raw event (fire-and-forget — don't block response)
    const eventType = parsed.type === "callback_query"
      ? "telegram_callback"
      : "telegram_message";

    void logRawEvent(user.id, eventType, body, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 6. Build payload for the INBOUND queue
    const queuePayload: Record<string, unknown> = {
      channel: "telegram",
      telegramUserId: parsed.user.id,
      chatId: parsed.chatId,
      messageId: parsed.messageId,
      messageText: parsed.messageText,
      updateType: parsed.type,
    };

    // Handle callback queries (approve/reject/snooze button presses)
    if (parsed.type === "callback_query" && parsed.callbackData) {
      const callbackAction = parseCallbackAction(parsed.callbackData);
      if (callbackAction) {
        queuePayload["callbackAction"] = callbackAction.action;
        queuePayload["callbackActionId"] = callbackAction.actionId;
      }
      queuePayload["callbackQueryId"] = parsed.callbackQueryId;
      queuePayload["callbackData"] = parsed.callbackData;
    }

    // 7. Enqueue to INBOUND queue
    const agentMessage = createAgentMessage(
      "voice",
      "conductor",
      "event",
      queuePayload,
      user.id,
    );

    const queue = getQueue(QUEUE_NAMES.INBOUND, env.REDIS_URL);
    await queue.add("telegram-webhook", agentMessage, {
      priority: parsed.type === "callback_query" ? 1 : 2,
    });

    // 8. Return 200 immediately
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Always return 200 to Telegram to prevent retry storms
    console.error(
      "Telegram webhook error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json({ ok: true });
  }
}
