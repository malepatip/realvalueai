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
import { TelegramAdapter } from "@/lib/channels/telegram";
import { processInboundMessage } from "@/agents/conductor/worker";
import type { ConductorContext, ConductorDeps } from "@/agents/conductor/types";
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
  // Env validation runs OUTSIDE the request try/catch. The catch-all below
  // returns 200 to Telegram to prevent retry storms on transient errors
  // (DB / Redis / network), but a Zod failure here means misconfig — it
  // will not fix itself on retry, so let it surface as a 500 with a visible
  // log line instead of being silently swallowed.
  const env = getEnv();

  try {
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

    // 7. Enqueue to INBOUND queue (kept for replay/observability; the
    //    synchronous Conductor invocation below is what actually drives
    //    the user-facing reply today).
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

    // 8. Synchronously invoke the Conductor and send a reply.
    //    Per tasks.md "Deployment hosts per workload" — the Conductor
    //    runs as a Vercel function (sub-10s classify+route+send), not a
    //    long-running worker. The same processInboundMessage() function
    //    can later be invoked from a BullMQ consumer once we want async
    //    fan-out, with no change to the conductor logic.
    //    Wrapped in try/catch so a Conductor or send failure doesn't
    //    break the webhook ack — the message was already enqueued.
    try {
      const conductorCtx: ConductorContext = {
        userId: user.id,
        telegramUserId: parsed.user.id,
        chatId: parsed.chatId,
        messageText: parsed.messageText ?? "",
        updateType: parsed.type === "callback_query" ? "callback_query" : "message",
        ...(parsed.messageId !== undefined && { messageId: parsed.messageId }),
        ...(parsed.type === "callback_query" && parsed.callbackData
          ? (() => {
              const cb = parseCallbackAction(parsed.callbackData);
              return {
                ...(cb && { callbackAction: cb.action, callbackActionId: cb.actionId }),
                ...(parsed.callbackQueryId && { callbackQueryId: parsed.callbackQueryId }),
              };
            })()
          : {}),
        ...(displayName && { displayName }),
      };

      const conductorDeps: ConductorDeps = {
        supabaseUrl: env.SUPABASE_URL,
        supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
        redisUrl: env.REDIS_URL,
        encryptionKey: env.ENCRYPTION_KEY,
        plaidClientId: env.PLAID_CLIENT_ID,
        plaidSecret: env.PLAID_SECRET,
        plaidEnv: env.PLAID_ENV,
        appUrl: process.env["NEXT_PUBLIC_APP_URL"] ?? "https://realvalueai.vercel.app",
      };
      const reply = await processInboundMessage(conductorCtx, conductorDeps);
      const tg = new TelegramAdapter(env.TELEGRAM_BOT_TOKEN);
      await tg.sendText(String(parsed.chatId), reply.text);
    } catch (replyError) {
      console.error(
        "Telegram webhook reply error (non-fatal):",
        replyError instanceof Error ? replyError.message : "Unknown error",
      );
    }

    // 9. Return 200 immediately (regardless of reply success/failure).
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
