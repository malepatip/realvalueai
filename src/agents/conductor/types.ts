/**
 * Conductor agent types.
 *
 * The conductor is the entry point for every inbound user message. It
 * classifies the intent (slash command, natural language, button press),
 * routes to a handler, and returns a reply payload. Side effects (sending
 * the reply via TelegramAdapter, persisting state) are the caller's
 * responsibility — the conductor functions themselves are pure.
 *
 * @module agents/conductor/types
 */

/**
 * Inbound message context passed to the conductor.
 *
 * Built by the webhook handler from the parsed Telegram update + the
 * resolved internal user. The conductor consumes this and returns a
 * ConductorReply; it never reaches back into request state.
 */
export interface ConductorContext {
  /** Internal user ID (UUID from `users` table) */
  readonly userId: string;
  /** Telegram numeric user ID */
  readonly telegramUserId: number;
  /** Telegram chat ID — this is what the reply gets sent to */
  readonly chatId: number;
  /** Original message text (or callback data if this is a button press) */
  readonly messageText: string;
  /** Telegram message ID, if this is a regular message */
  readonly messageId?: number;
  /** Update kind — distinguishes button presses from regular messages */
  readonly updateType: "message" | "callback_query";
  /** Parsed callback action (e.g. "approve", "reject", "snooze"), if any */
  readonly callbackAction?: string;
  /** Action ID the callback refers to */
  readonly callbackActionId?: string;
  /** Raw callback_query.id — needed to answer the callback */
  readonly callbackQueryId?: string;
  /** User's display name (best-effort, may be empty) */
  readonly displayName?: string;
}

/**
 * Classified intent emitted by the classifier.
 *
 * Three shapes:
 *   - `command` — message starts with `/` (slash command), e.g. /start
 *   - `callback_query` — user tapped an inline keyboard button
 *   - `natural_language` — anything else (free-form chat)
 */
export type Intent =
  | { readonly kind: "command"; readonly name: string; readonly args: readonly string[] }
  | { readonly kind: "callback_query"; readonly action: string; readonly actionId: string }
  | { readonly kind: "natural_language"; readonly text: string };

/**
 * Reply payload returned by every handler.
 *
 * Keeping this small on purpose. Inline keyboards, attachments, and
 * multi-message replies will land as additional optional fields when
 * downstream handlers (3.10 bank linking, 4.6 settings) need them.
 */
export interface ConductorReply {
  /** Plain-text body. Telegram sends with parse_mode=Markdown by default. */
  readonly text: string;
  /**
   * If this reply is in response to a callback_query, the conductor MAY
   * include the callback_query.id so the caller can answer it (Telegram
   * shows a small toast / spinner stop on the user's button).
   */
  readonly answerCallbackQueryId?: string;
}

/**
 * Synchronous handler signature. Pure — no I/O, no Telegram API calls.
 * Side effects happen in the caller (the webhook handler).
 */
export type Handler = (ctx: ConductorContext, intent: Intent) => ConductorReply;
