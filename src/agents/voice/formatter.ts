/**
 * Message formatting pipeline for the Voice agent.
 *
 * Applies personality mode, account masking, safe mode, stealth mode,
 * and simplified mode in sequence before delivery.
 */

import type { FormattedMessage } from "@/types/voice";
import type { UserMessagePrefs } from "./types";
import { applyPersonalityMode } from "./personality";

/**
 * Format a message for delivery by applying all user preference transformations.
 *
 * Pipeline order:
 *   1. Apply personality mode
 *   2. Mask account numbers (security — always applied)
 *   3. Apply stealth mode (if enabled)
 *   4. Apply safe mode (if enabled)
 *   5. Apply simplified mode (if enabled)
 */
export function formatMessage(
  content: string,
  _userId: string,
  userPrefs: UserMessagePrefs,
): FormattedMessage {
  let text = applyPersonalityMode(
    content,
    userPrefs.personality_mode,
    userPrefs.locale,
  );

  // Always mask account numbers — never expose full numbers
  text = maskAccountNumbers(text);

  if (userPrefs.stealth_mode_enabled) {
    text = applyStealthMode(text);
  }

  if (userPrefs.safe_mode_enabled) {
    text = applySafeMode(text, userPrefs.safe_mode_cover_topic);
  }

  if (userPrefs.simplified_mode_enabled) {
    text = applySimplifiedMode(text);
  }

  return {
    text,
    personalityMode: userPrefs.personality_mode,
    locale: userPrefs.locale,
    isSafeMode: userPrefs.safe_mode_enabled,
    isStealthMode: userPrefs.stealth_mode_enabled,
    isSimplifiedMode: userPrefs.simplified_mode_enabled,
  };
}

// ---------------------------------------------------------------------------
// Account number masking
// ---------------------------------------------------------------------------

/**
 * Regex matching sequences of 4+ digits (optionally separated by spaces or
 * dashes) that look like account numbers, card numbers, or routing numbers.
 * Does NOT match dollar amounts (preceded by $) or short numbers like dates.
 */
const ACCOUNT_NUMBER_RE = /(?<!\$)\b(\d[\d\s-]{6,}\d)\b/g;

/**
 * Replace any account-like number sequences with only the last 4 digits.
 *
 * Examples:
 *   "1234567890"      → "****7890"
 *   "1234-5678-9012"  → "****9012"
 *   "1234 5678 9012"  → "****9012"
 */
export function maskAccountNumbers(text: string): string {
  return text.replace(ACCOUNT_NUMBER_RE, (match) => {
    const digitsOnly = match.replace(/[\s-]/g, "");
    const last4 = digitsOnly.slice(-4);
    return `****${last4}`;
  });
}

// ---------------------------------------------------------------------------
// Safe mode — disguise financial content
// ---------------------------------------------------------------------------

/** Cover topic templates that replace financial content entirely. */
const COVER_TOPICS: Readonly<Record<string, string>> = {
  weather:
    "Looks like partly cloudy skies today with a high of 72°F. " +
    "Perfect weather for a walk! Remember to stay hydrated. 🌤️",
  recipes:
    "Here's a quick recipe idea: garlic butter pasta with cherry tomatoes. " +
    "Cook pasta al dente, sauté garlic in butter, toss together. Easy and delicious! 🍝",
  fitness:
    "Great day for a workout! Try 3 sets of 15 squats, 10 push-ups, " +
    "and a 20-minute walk. Consistency beats intensity. 💪",
  sports:
    "Big game coming up this weekend! The analysts are split on the outcome. " +
    "Should be an exciting match to watch. ⚽",
};

const DEFAULT_COVER =
  "Just checking in! Hope you're having a great day. " +
  "Nothing urgent — talk soon! 😊";

/**
 * Replace the entire message with a cover-topic message.
 *
 * Safe mode completely disguises financial content so that anyone reading
 * over the user's shoulder sees an innocuous message about weather, recipes,
 * fitness, or sports.
 */
export function applySafeMode(
  _message: string,
  coverTopic: string,
): string {
  const normalized = coverTopic.toLowerCase().trim();
  return COVER_TOPICS[normalized] ?? DEFAULT_COVER;
}

// ---------------------------------------------------------------------------
// Stealth mode — remove specific amounts and account details
// ---------------------------------------------------------------------------

/** Dollar amounts like $12, $1,234.56 */
const DOLLAR_RE = /\$[\d,]+(?:\.\d{1,2})?/g;

/** Percentage amounts like 15%, 3.5% */
const PERCENT_RE = /\d+(?:\.\d+)?%/g;

/**
 * Remove all specific dollar amounts, percentages, and account-like numbers.
 * Replaces them with generic language.
 */
export function applyStealthMode(message: string): string {
  let result = message;
  result = result.replace(DOLLAR_RE, "[amount]");
  result = result.replace(PERCENT_RE, "[percentage]");
  // Account numbers already masked by maskAccountNumbers, but double-check
  result = result.replace(ACCOUNT_NUMBER_RE, "****");
  return result;
}

// ---------------------------------------------------------------------------
// Simplified mode — max 2 sentences, max 2 options, 6th-grade vocabulary
// ---------------------------------------------------------------------------

/** Words that are above 6th-grade reading level, mapped to simpler alternatives. */
const SIMPLIFICATION_MAP: Readonly<Record<string, string>> = {
  projected: "expected",
  aggregate: "total",
  expenditure: "spending",
  expenditures: "spending",
  transaction: "payment",
  transactions: "payments",
  subscription: "service",
  subscriptions: "services",
  insufficient: "not enough",
  accumulate: "add up",
  accumulated: "added up",
  reconcile: "match up",
  amortize: "spread out",
  depreciation: "loss in value",
  diversify: "spread out",
  liquidate: "cash out",
  portfolio: "investments",
  reimbursement: "refund",
  remittance: "payment",
  delinquent: "overdue",
  collateral: "backup",
  liability: "debt",
  liabilities: "debts",
  utilize: "use",
  approximately: "about",
  subsequently: "then",
  consequently: "so",
  furthermore: "also",
  nevertheless: "still",
  notwithstanding: "despite",
};

/**
 * Simplify a message to max 2 sentences, max 2 options, and 6th-grade vocabulary.
 *
 * Steps:
 *   1. Replace complex words with simpler alternatives
 *   2. If the message contains a list of options, keep only the first 2
 *   3. Truncate to at most 2 sentences
 */
export function applySimplifiedMode(message: string): string {
  let result = simplifyVocabulary(message);
  result = limitOptions(result, 2);
  result = limitSentences(result, 2);
  return result.trim();
}

function simplifyVocabulary(text: string): string {
  let result = text;
  for (const [complex, simple] of Object.entries(SIMPLIFICATION_MAP)) {
    // Case-insensitive word boundary replacement
    const re = new RegExp(`\\b${complex}\\b`, "gi");
    result = result.replace(re, simple);
  }
  return result;
}

/**
 * Keep only the first N sentences. A sentence ends with `.`, `!`, or `?`
 * followed by whitespace or end-of-string.
 *
 * Numbered list markers (e.g., "1.", "2.") are NOT counted as sentence endings.
 */
function limitSentences(text: string, max: number): string {
  // Match sentence-ending punctuation NOT preceded by a digit (to skip "1.", "2.", etc.)
  const sentenceEndRe = /(?<!\d)[.!?](?:\s|$)/g;
  let count = 0;
  let lastIndex = 0;

  let match: RegExpExecArray | null = sentenceEndRe.exec(text);
  while (match !== null) {
    count++;
    lastIndex = match.index + match[0].length;
    if (count >= max) {
      return text.slice(0, lastIndex).trim();
    }
    match = sentenceEndRe.exec(text);
  }

  // Fewer than max sentences — return as-is
  return text;
}

/**
 * If the text contains numbered or bulleted options, keep only the first N.
 * Options are lines starting with a number+period, dash, bullet, or emoji.
 */
function limitOptions(text: string, max: number): string {
  const lines = text.split("\n");
  const optionRe = /^\s*(?:\d+[.)]\s|[-•*]\s|[🔥🎉🧘📚🔍🔧🎯🗣️⚠️💰💸📅✅🚫❌🛑💤📈⏰👻]\s?)/;

  let optionCount = 0;
  const kept: string[] = [];

  for (const line of lines) {
    if (optionRe.test(line)) {
      optionCount++;
      if (optionCount > max) {
        continue;
      }
    }
    kept.push(line);
  }

  return kept.join("\n");
}
