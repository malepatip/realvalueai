/**
 * Conductor entry point.
 *
 * `processInboundMessage(ctx)` is the only function the webhook needs
 * to call. It classifies, routes, and returns a ConductorReply that
 * the caller can hand to TelegramAdapter (or any channel adapter).
 *
 * Pure — no I/O, no DB, no Telegram API. Tests can call it directly
 * with synthetic contexts. The same function will be invocable from a
 * BullMQ consumer once we want async fan-out, without changing the
 * conductor logic itself (per the architecture-pivot table in
 * tasks.md: Vercel function host today, same code path either way).
 *
 * @module agents/conductor/worker
 */

import type { ConductorContext, ConductorReply } from "./types";
import { classify } from "./classifier";
import { route } from "./router";

export function processInboundMessage(ctx: ConductorContext): ConductorReply {
  const intent = classify(ctx);
  return route(ctx, intent);
}
