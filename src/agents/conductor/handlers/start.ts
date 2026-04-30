/**
 * /start handler — Telegram's standard onboarding entrypoint.
 *
 * For the MVP this returns the Voice agent's pre-written crew intro
 * template. The full onboarding flow (personality selection, goal
 * question, cultural prefs over 5 chat exchanges per task 5.8) lands
 * later — for now `/start` greets the user and points them at /help.
 *
 * @module agents/conductor/handlers/start
 */

import { getTemplate, TEMPLATE_KEYS } from "@/agents/voice/templates";
import type { ConductorContext, ConductorReply } from "../types";

export function handleStart(ctx: ConductorContext): ConductorReply {
  const intro = getTemplate(TEMPLATE_KEYS.ONBOARDING_CREW_INTRO);
  const greeting = ctx.displayName
    ? `Hey ${ctx.displayName} — `
    : "Hey — ";
  const text =
    `${greeting}${intro}\n\n` +
    "Send /help any time to see what I can do.";
  return { text };
}
