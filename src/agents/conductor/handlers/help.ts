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
  // GOTCHA: TelegramAdapter sends with parse_mode=Markdown.
  // (1) A bare command name containing `_` (like /link_simplefin) gets
  //     parsed as an italic-toggle and Telegram returns 400 — wrap in
  //     backticks so underscores are literal.
  // (2) An italic block wrapping nested inline code (`_(...code...)_`)
  //     also breaks Telegram's parser. Don't combine those styles.
  // Keep the help text bullet-list-only with backticked commands; no
  // italics, no nested formatting.
  const text =
    "Here's what I can do today:\n\n" +
    "• `/start` — meet your crew\n" +
    "• `/help` — show this list\n" +
    "• `/link_bank` — connect a bank via Plaid (recommended — fast, secure, all major US banks)\n" +
    "• `/accounts` — list your connected bank accounts\n" +
    "• `/sync` — pull fresh transactions from your banks\n" +
    "• `/aha` — see what I found in your accounts (run `/sync` first)\n\n" +
    "Power-user fallback if Plaid doesn't have your bank:\n" +
    "• `/link_simplefin <access-url>` — connect via SimpleFIN\n\n" +
    "More coming soon: settings, subscription cancellation, " +
    "overdraft predictions, government benefits search. Anything " +
    "you message me right now is logged so we can build the things " +
    "you actually want.";
  return { text };
}
