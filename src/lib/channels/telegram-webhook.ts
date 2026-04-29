/**
 * Telegram Webhook Parsing and Verification
 *
 * Parses incoming Telegram webhook updates and verifies
 * webhook authenticity using the bot token.
 *
 * @module channels/telegram-webhook
 */

import { createHmac } from "node:crypto";

/** Parsed Telegram user info from a webhook update */
export interface TelegramUser {
  readonly id: number;
  readonly firstName: string;
  readonly lastName?: string;
  readonly username?: string;
}

/** Parsed result from a Telegram webhook update */
export interface ParsedTelegramUpdate {
  readonly type: "message" | "callback_query";
  readonly messageText: string | null;
  readonly callbackData: string | null;
  readonly callbackQueryId: string | null;
  readonly user: TelegramUser;
  readonly chatId: number;
  readonly messageId?: number;
  readonly rawUpdate: Record<string, unknown>;
}

/** Telegram webhook update shape (subset of fields we use) */
interface TelegramUpdate {
  readonly update_id: number;
  readonly message?: {
    readonly message_id: number;
    readonly from: {
      readonly id: number;
      readonly first_name: string;
      readonly last_name?: string;
      readonly username?: string;
    };
    readonly chat: { readonly id: number };
    readonly text?: string;
  };
  readonly callback_query?: {
    readonly id: string;
    readonly from: {
      readonly id: number;
      readonly first_name: string;
      readonly last_name?: string;
      readonly username?: string;
    };
    readonly message?: {
      readonly message_id: number;
      readonly chat: { readonly id: number };
    };
    readonly data?: string;
  };
}

/**
 * Parse a Telegram webhook update body into a structured result.
 *
 * Handles both regular messages and callback queries (button presses
 * for approve/reject/snooze flows).
 */
export function parseTelegramUpdate(
  body: Record<string, unknown>,
): ParsedTelegramUpdate | null {
  const update = body as unknown as TelegramUpdate;

  if (update.callback_query) {
    const cq = update.callback_query;
    const from = cq.from;
    return {
      type: "callback_query",
      messageText: null,
      callbackData: cq.data ?? null,
      callbackQueryId: cq.id,
      user: {
        id: from.id,
        firstName: from.first_name,
        lastName: from.last_name,
        username: from.username,
      },
      chatId: cq.message?.chat.id ?? from.id,
      messageId: cq.message?.message_id,
      rawUpdate: body,
    };
  }

  if (update.message) {
    const msg = update.message;
    const from = msg.from;
    return {
      type: "message",
      messageText: msg.text ?? null,
      callbackData: null,
      callbackQueryId: null,
      user: {
        id: from.id,
        firstName: from.first_name,
        lastName: from.last_name,
        username: from.username,
      },
      chatId: msg.chat.id,
      messageId: msg.message_id,
      rawUpdate: body,
    };
  }

  return null;
}

/**
 * Verify a Telegram webhook request's authenticity.
 *
 * When using `setWebhook` with a `secret_token`, the token
 * is sent in the `X-Telegram-Bot-Api-Secret-Token` header.
 */
export function verifyTelegramSignature(
  headerSecret: string | null | undefined,
  expectedSecret: string,
): boolean {
  if (!headerSecret) {
    return false;
  }
  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(expectedSecret, "utf8");
  const received = Buffer.from(headerSecret, "utf8");
  if (expected.length !== received.length) {
    return false;
  }
  return createHmac("sha256", expected).digest().equals(
    createHmac("sha256", received).digest(),
  );
}

/**
 * Map a callback query data string to an action type.
 * Callback data format: "action:actionId" (e.g., "approve:uuid-here")
 */
export function parseCallbackAction(
  callbackData: string,
): { action: "approve" | "reject" | "snooze"; actionId: string } | null {
  const parts = callbackData.split(":");
  if (parts.length !== 2) {
    return null;
  }
  const [action, actionId] = parts;
  if (!action || !actionId) {
    return null;
  }
  if (action !== "approve" && action !== "reject" && action !== "snooze") {
    return null;
  }
  return { action, actionId };
}
