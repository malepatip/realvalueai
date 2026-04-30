/**
 * Routes a classified Intent to the right handler.
 *
 * Handler registry is intentionally a plain object lookup — fast,
 * obvious, and the auditor (or future Claude) can see every wired
 * command at a glance. New chat commands (3.10 `/link_bank`, 4.6
 * `/personality`, 5.5 `/link_partner`, etc.) get a one-line entry
 * here pointing at the new handler.
 *
 * @module agents/conductor/router
 */

import type { ConductorContext, ConductorReply, Intent } from "./types";
import { handleStart } from "./handlers/start";
import { handleHelp } from "./handlers/help";
import {
  handleUnknownCommand,
  handleNaturalLanguage,
  handlePendingCallback,
} from "./handlers/fallback";

/**
 * Map of slash-command name → handler. Names are case-insensitive
 * (the classifier lowercases). Add new commands here as they ship.
 */
const COMMAND_HANDLERS: Readonly<Record<string, (ctx: ConductorContext) => ConductorReply>> = {
  start: handleStart,
  help: handleHelp,
};

export function route(ctx: ConductorContext, intent: Intent): ConductorReply {
  if (intent.kind === "command") {
    const handler = COMMAND_HANDLERS[intent.name];
    if (handler) {
      return handler(ctx);
    }
    return handleUnknownCommand(intent);
  }

  if (intent.kind === "callback_query") {
    return handlePendingCallback(ctx, intent);
  }

  return handleNaturalLanguage();
}
