/**
 * /help handler — lists currently-active chat commands.
 *
 * Only commands wired to a real handler are listed here. As Wave 3+
 * chat handlers land (`/link_bank`, `/personality`, `/vault`, etc.),
 * extend this list. Surfacing a command in /help that isn't actually
 * routed is worse than not listing it — it teaches users to send
 * dead commands and undermines trust.
 *
 * @module agents/conductor/handlers/help
 */

import type { ConductorReply } from "../types";

export function handleHelp(): ConductorReply {
  const text =
    "Here's what I can do today:\n\n" +
    "• /start — meet your crew\n" +
    "• /help — show this list\n\n" +
    "More coming soon: bank linking, settings, subscription cancellation, " +
    "overdraft predictions, government benefits search, and more. " +
    "Anything you message me right now is logged so we can build the " +
    "things you actually want.";
  return { text };
}
