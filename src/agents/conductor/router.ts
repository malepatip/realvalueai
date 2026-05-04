/**
 * Routes a classified Intent to the right handler.
 *
 * Handler registry is intentionally a plain object lookup — fast,
 * obvious, and the auditor (or future Claude) can see every wired
 * command at a glance. New chat commands (4.6 `/personality`,
 * 5.5 `/link_partner`, etc.) get a one-line entry here pointing at
 * the new handler.
 *
 * @module agents/conductor/router
 */

import type {
  ConductorContext,
  ConductorDeps,
  ConductorReply,
  Handler,
  Intent,
} from "./types";
import { handleStart } from "./handlers/start";
import { handleHelp } from "./handlers/help";
import {
  handleUnknownCommand,
  handleNaturalLanguage,
  handlePendingCallback,
} from "./handlers/fallback";
import { handleLinkSimpleFin, handleAccounts } from "./handlers/bank-linking";
import { handleLinkBank } from "./handlers/plaid-link";
import { handleSync } from "./handlers/sync";
import { handleAha } from "./handlers/aha";

/**
 * Map of slash-command name → handler. Names are case-insensitive
 * (the classifier lowercases). Add new commands here as they ship.
 */
const COMMAND_HANDLERS: Readonly<Record<string, Handler>> = {
  start: handleStart,
  help: handleHelp,
  link_bank: handleLinkBank,
  link_simplefin: handleLinkSimpleFin,
  accounts: handleAccounts,
  sync: handleSync,
  aha: handleAha,
};

export async function route(
  ctx: ConductorContext,
  intent: Intent,
  deps: ConductorDeps,
): Promise<ConductorReply> {
  if (intent.kind === "command") {
    const handler = COMMAND_HANDLERS[intent.name];
    if (handler) {
      return handler(ctx, intent, deps);
    }
    return handleUnknownCommand(intent);
  }

  if (intent.kind === "callback_query") {
    return handlePendingCallback(ctx, intent);
  }

  return handleNaturalLanguage();
}
