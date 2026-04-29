/**
 * Agent attribution — prepend source-agent context to messages.
 *
 * Per design rule #24: the user knows it's a team conceptually, but all
 * communication comes through the Voice agent. Attribution tells the user
 * which specialist originated the insight without breaking the single-voice UX.
 */

import type { AgentType } from "@/types/agents";

/** Attribution prefixes per agent type. Voice has no prefix — it IS the voice. */
const ATTRIBUTION_MAP: Readonly<Record<AgentType, string>> = {
  conductor: "Your team noticed: ",
  watcher: "Your Watcher spotted: ",
  fixer: "Your Fixer handled: ",
  hunter: "Your Hunter found: ",
  voice: "",
};

/**
 * Prepend agent attribution to a message.
 *
 * If the source agent is `voice`, the message is returned unchanged
 * (the Voice agent doesn't attribute to itself).
 */
export function addAttribution(
  message: string,
  sourceAgent: AgentType,
): string {
  const prefix = ATTRIBUTION_MAP[sourceAgent];
  if (prefix === "") {
    return message;
  }
  return `${prefix}${message}`;
}
