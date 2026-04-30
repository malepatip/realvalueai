/**
 * /help handler — lists currently-active chat commands.
 *
 * Only commands wired to a real handler are listed here. As Wave 3+
 * chat handlers land (`/personality`, `/vault`, etc.), extend this
 * list. Surfacing a command in /help that isn't actually routed is
 * worse than not listing it — it teaches users to send dead commands
 * and undermines trust.
 *
 * @module agents/conductor/handlers/help
 */

import type { ConductorReply } from "../types";

export function handleHelp(): ConductorReply {
  // GOTCHA: TelegramAdapter sends with parse_mode=Markdown. A bare
  // command name containing `_` (like /link_simplefin) gets parsed as
  // an italic-toggle and Telegram returns 400 invalid markdown — the
  // bot then silently fails to reply. Always wrap command names in
  // backticks (code spans) so underscores are treated as literal.
  const text =
    "Here's what I can do today:\n\n" +
    "• `/start` — meet your crew\n" +
    "• `/help` — show this list\n" +
    "• `/link_bank` — connect a bank via Plaid (recommended — fast, " +
    "secure, all major US banks)\n" +
    "• `/accounts` — list your connected bank accounts\n\n" +
    "More coming soon: settings, subscription cancellation, " +
    "overdraft predictions, government benefits search. " +
    "Anything you message me right now is logged so we can build the " +
    "things you actually want.\n\n" +
    "_(Power-user fallback for banks Plaid doesn't support: " +
    "`/link_simplefin <access-url>`)_";
  return { text };
}
