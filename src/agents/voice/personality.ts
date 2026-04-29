/**
 * Template-based personality transformations for the Voice agent (Free tier).
 *
 * Each mode applies string-level transformations to content before delivery.
 * Premium tier uses LLM-powered personality (see voice/llm.ts in task 3.8).
 */

import type { PersonalityMode } from "@/types/voice";

/** Regex matching dollar amounts like $12, $1,234.56, $0.99 */
const DOLLAR_AMOUNT_RE = /\$[\d,]+(?:\.\d{1,2})?/g;

/**
 * Apply a personality mode transformation to message content.
 *
 * - `savage`  — humorous roasts of spending habits
 * - `hype`    — enthusiastic celebration of wins
 * - `zen`     — calming language, replaces dollar amounts with qualitative descriptions
 * - `mentor`  — educational explanations with context
 *
 * @param content  The raw message content to transform.
 * @param mode     The user's selected personality mode.
 * @param _locale  Reserved for future locale-aware transformations.
 * @returns The transformed content string.
 */
export function applyPersonalityMode(
  content: string,
  mode: PersonalityMode,
  _locale: string,
): string {
  switch (mode) {
    case "savage":
      return applySavageMode(content);
    case "hype":
      return applyHypeMode(content);
    case "zen":
      return applyZenMode(content);
    case "mentor":
      return applyMentorMode(content);
  }
}

// ---------------------------------------------------------------------------
// Savage mode — humorous roasts
// ---------------------------------------------------------------------------

/** Savage-mode prefixes randomly prepended to messages. */
const SAVAGE_PREFIXES: readonly string[] = [
  "Real talk: ",
  "Not gonna sugarcoat this: ",
  "Brace yourself: ",
  "Oof. ",
  "Yikes. ",
];

function applySavageMode(content: string): string {
  // Deterministic prefix based on content length for testability
  const prefix = SAVAGE_PREFIXES[content.length % SAVAGE_PREFIXES.length]!;
  const suffix = " 💀";
  return `${prefix}${content}${suffix}`;
}

// ---------------------------------------------------------------------------
// Hype mode — enthusiastic celebration
// ---------------------------------------------------------------------------

/** Hype-mode prefixes. */
const HYPE_PREFIXES: readonly string[] = [
  "YOOO ",
  "LET'S GO! ",
  "BIG MOVES! ",
  "AMAZING! ",
  "HUGE! ",
];

function applyHypeMode(content: string): string {
  const prefix = HYPE_PREFIXES[content.length % HYPE_PREFIXES.length]!;
  const suffix = " 🎉🔥";
  return `${prefix}${content}${suffix}`;
}

// ---------------------------------------------------------------------------
// Zen mode — calming language, hide dollar amounts
// ---------------------------------------------------------------------------

/**
 * Map dollar amounts to qualitative descriptions.
 * Thresholds are intentionally simple for the template-based Free tier.
 */
function dollarToQualitative(dollarStr: string): string {
  const numeric = parseFloat(dollarStr.replace(/[$,]/g, ""));
  if (isNaN(numeric)) return "an amount";
  if (numeric <= 5) return "a small amount";
  if (numeric <= 25) return "a modest amount";
  if (numeric <= 100) return "a moderate amount";
  if (numeric <= 500) return "a significant amount";
  return "a large amount";
}

function applyZenMode(content: string): string {
  const prefix = "🧘 Take a breath. ";
  const replaced = content.replace(DOLLAR_AMOUNT_RE, (match) =>
    dollarToQualitative(match),
  );
  return `${prefix}${replaced}`;
}

// ---------------------------------------------------------------------------
// Mentor mode — educational explanations
// ---------------------------------------------------------------------------

function applyMentorMode(content: string): string {
  const prefix = "📚 Here's what's happening: ";
  const suffix = " Understanding your finances is the first step to controlling them.";
  return `${prefix}${content}${suffix}`;
}
