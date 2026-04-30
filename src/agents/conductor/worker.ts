/**
 * Conductor entry point.
 *
 * `processInboundMessage(ctx, deps)` is the only function the webhook
 * needs to call. It classifies, routes, and returns a ConductorReply
 * that the caller can hand to TelegramAdapter (or any channel adapter).
 *
 * Pure-ish: this function itself does no I/O — handlers may, via the
 * injected `deps`. Tests can call it with mocked deps. The same
 * function is queue-consumer-ready for any future async fan-out, with
 * no change to the conductor logic itself (per tasks.md "Deployment
 * hosts per workload": Vercel function host today, same code path
 * either way).
 *
 * @module agents/conductor/worker
 */

import type { ConductorContext, ConductorDeps, ConductorReply } from "./types";
import { classify } from "./classifier";
import { route } from "./router";

export async function processInboundMessage(
  ctx: ConductorContext,
  deps: ConductorDeps,
): Promise<ConductorReply> {
  const intent = classify(ctx);
  return route(ctx, intent, deps);
}
