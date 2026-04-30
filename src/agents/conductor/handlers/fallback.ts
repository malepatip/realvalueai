/**
 * Fallback handlers for intents we don't yet have specific handlers for.
 *
 * Three flavors:
 *   - `unknownCommand`     — user sent a slash command we don't recognize
 *   - `naturalLanguage`    — free-form chat, no command. Until 3.8 LLM
 *                            classification lands, this is the catch-all.
 *   - `pendingCallback`    — user tapped an inline button whose handler
 *                            isn't wired yet (approve/reject/snooze ship
 *                            with 4.1 Fixer).
 *
 * Every fallback acknowledges the user (the bot never goes silent —
 * see Requirement 7.6) and points at /help so they have a path forward.
 *
 * @module agents/conductor/handlers/fallback
 */

import type { ConductorContext, ConductorReply, Intent } from "../types";

export function handleUnknownCommand(intent: Intent & { kind: "command" }): ConductorReply {
  return {
    text:
      `I don't recognize the command \`/${intent.name}\` yet. ` +
      "Send /help to see what's currently available — and if there's " +
      "something specific you wanted, tell me in plain text and I'll " +
      "log it as a feature request.",
  };
}

export function handleNaturalLanguage(): ConductorReply {
  return {
    text:
      "Got it — I logged your message. I can't fully chat back yet (LLM " +
      "intent classification is coming in task 3.8), but slash commands " +
      "work. Try /help to see what I can do today.",
  };
}

export function handlePendingCallback(
  ctx: ConductorContext,
  intent: Intent & { kind: "callback_query" },
): ConductorReply {
  return {
    text:
      `Received your "${intent.action}" tap. The handler for this isn't ` +
      "wired yet — it lands with task 4.1 (Fixer). Your tap was logged.",
    answerCallbackQueryId: ctx.callbackQueryId,
  };
}
