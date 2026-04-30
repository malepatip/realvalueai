/**
 * Intent classification.
 *
 * Pure function: takes a ConductorContext, returns an Intent. No I/O.
 *
 * For the MVP slice this is rule-based — we recognize Telegram slash
 * commands and inline-keyboard callback queries and treat everything
 * else as `natural_language` for the fallback handler. LLM-based
 * intent classification (the 11-intent taxonomy from `tasks.md` 3.6
 * — `cancel_subscription`, `find_benefits`, etc.) lands in 3.8 once
 * we have NIM API integration; until then, the slash-command surface
 * is sufficient for every Wave-3 chat handler we've specified.
 *
 * @module agents/conductor/classifier
 */

import type { ConductorContext, Intent } from "./types";

/**
 * Strip a possible `@BotName` suffix from a slash command. Telegram
 * appends `@BotUsername` when a command is sent in a group chat to
 * disambiguate which bot should respond. We don't care which bot —
 * if it reached us, it's for us.
 */
function stripBotMention(commandToken: string): string {
  const at = commandToken.indexOf("@");
  return at === -1 ? commandToken : commandToken.slice(0, at);
}

export function classify(ctx: ConductorContext): Intent {
  if (ctx.updateType === "callback_query") {
    return {
      kind: "callback_query",
      action: ctx.callbackAction ?? "unknown",
      actionId: ctx.callbackActionId ?? "",
    };
  }

  const trimmed = ctx.messageText.trim();
  if (trimmed.startsWith("/") && trimmed.length > 1) {
    const tokens = trimmed.split(/\s+/);
    const head = tokens[0] ?? "/";
    const name = stripBotMention(head).slice(1).toLowerCase();
    return {
      kind: "command",
      name,
      args: tokens.slice(1),
    };
  }

  return { kind: "natural_language", text: trimmed };
}
