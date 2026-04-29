/**
 * Pre-written template messages for all critical Voice agent communications.
 *
 * Templates use {{varName}} syntax for variable interpolation.
 * Missing variables are left as-is (graceful degradation).
 */

/** All available template key names. */
export const TEMPLATE_KEYS = {
  // Overdraft alerts
  OVERDRAFT_ALERT: "overdraft_alert",

  // Action confirmations
  ACTION_CONFIRM_APPROVE: "action_confirm_approve",
  ACTION_CONFIRM_REJECT: "action_confirm_reject",
  ACTION_CONFIRM_COMPLETE: "action_confirm_complete",
  ACTION_CONFIRM_FAILED: "action_confirm_failed",

  // Error notifications
  ERROR_NOTIFICATION: "error_notification",

  // Kill switch
  KILL_SWITCH_CONFIRMATION: "kill_switch_confirmation",

  // Onboarding flow
  ONBOARDING_CREW_INTRO: "onboarding_crew_intro",
  ONBOARDING_PERSONALITY_SELECTION: "onboarding_personality_selection",
  ONBOARDING_GOAL_QUESTION: "onboarding_goal_question",

  // Morning briefing
  MORNING_BRIEFING: "morning_briefing",

  // Ghost action
  GHOST_ACTION: "ghost_action",

  // Watcher insights
  UNUSED_SUBSCRIPTION: "unused_subscription",
  BILL_INCREASE: "bill_increase",
  TRIAL_EXPIRING: "trial_expiring",
} as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[keyof typeof TEMPLATE_KEYS];

/** Map of template key → template string with {{varName}} placeholders. */
const TEMPLATES: Readonly<Record<TemplateKey, string>> = {
  // --- Overdraft alerts (urgent) ---
  [TEMPLATE_KEYS.OVERDRAFT_ALERT]:
    "⚠️ Overdraft alert: Your account ending in {{accountLast4}} is projected to overdraft by {{shortfallAmount}} around {{predictedDate}}. Current balance: {{currentBalance}}. Consider reducing upcoming expenses or transferring funds.",

  // --- Action confirmations ---
  [TEMPLATE_KEYS.ACTION_CONFIRM_APPROVE]:
    "✅ Got it — you approved the action: {{actionDescription}}. We're on it.",

  [TEMPLATE_KEYS.ACTION_CONFIRM_REJECT]:
    "🚫 Understood — you rejected the action: {{actionDescription}}. No changes will be made.",

  [TEMPLATE_KEYS.ACTION_CONFIRM_COMPLETE]:
    "🎉 Done! The action \"{{actionDescription}}\" has been completed. Estimated savings: {{savingsAmount}}.",

  [TEMPLATE_KEYS.ACTION_CONFIRM_FAILED]:
    "❌ The action \"{{actionDescription}}\" could not be completed. Reason: {{failureReason}}. We'll try an alternative approach.",

  // --- Error notifications ---
  [TEMPLATE_KEYS.ERROR_NOTIFICATION]:
    "Something went wrong: {{errorMessage}}. We're looking into it. No action is needed from you right now.",

  // --- Kill switch ---
  [TEMPLATE_KEYS.KILL_SWITCH_CONFIRMATION]:
    "🛑 Kill switch activated. All agent operations have been halted, bank tokens revoked, and your vault is locked. You are in full control. To resume, visit your dashboard.",

  // --- Onboarding flow ---
  [TEMPLATE_KEYS.ONBOARDING_CREW_INTRO]:
    "Welcome to RealValue! You've got a crew working behind the scenes:\n\n" +
    "🔍 Watcher — monitors your accounts for waste and risks\n" +
    "🔧 Fixer — takes action to cancel, negotiate, and save\n" +
    "🎯 Hunter — finds benefits, refunds, and better rates\n" +
    "🗣️ Voice — that's me, your single point of contact\n\n" +
    "Let's get you set up.",

  [TEMPLATE_KEYS.ONBOARDING_PERSONALITY_SELECTION]:
    "How should I talk to you? Pick a style:\n\n" +
    "🔥 Savage — I'll roast your bad spending habits\n" +
    "🎉 Hype — I'll celebrate every win like it's a championship\n" +
    "🧘 Zen — calm, peaceful, no stress\n" +
    "📚 Mentor — I'll explain everything so you learn along the way\n\n" +
    "Reply with: savage, hype, zen, or mentor.",

  [TEMPLATE_KEYS.ONBOARDING_GOAL_QUESTION]:
    "One more thing — what's your main financial goal right now?\n\n" +
    "Examples: save for a trip, pay off debt, build an emergency fund, just stop wasting money.\n\n" +
    "Tell me in your own words.",

  // --- Morning briefing ---
  [TEMPLATE_KEYS.MORNING_BRIEFING]:
    "☀️ Good morning! Here's your daily snapshot:\n\n" +
    "💰 Balance: {{currentBalance}}\n" +
    "💸 Yesterday's spending: {{yesterdaySpending}}\n" +
    "📅 Upcoming bills: {{upcomingBillsSummary}}\n" +
    "⚠️ Overdraft risk: {{overdraftRisk}}\n\n" +
    "{{overnightInsights}}" +
    "{{pendingActions}}",

  // --- Ghost action ---
  [TEMPLATE_KEYS.GHOST_ACTION]:
    "👻 If you'd let me, I would have saved you {{savingsAmount}} by {{actionDescription}}. Running total of missed savings: {{runningTotal}}.",

  // --- Watcher insights ---
  [TEMPLATE_KEYS.UNUSED_SUBSCRIPTION]:
    "💤 Unused subscription found: You're paying {{amount}}/mo for {{merchantName}}, but you haven't used it in {{daysSinceUsage}} days. Want me to cancel it?",

  [TEMPLATE_KEYS.BILL_INCREASE]:
    "📈 Bill increase detected: {{merchantName}} went from {{previousAmount}}/mo to {{newAmount}}/mo — that's a {{percentageChange}}% increase. Want me to look into it?",

  [TEMPLATE_KEYS.TRIAL_EXPIRING]:
    "⏰ Trial expiring soon: Your {{merchantName}} trial ends in {{daysRemaining}} days. After that, you'll be charged {{chargeAmount}}/mo. Want me to cancel before it converts?",
};

/**
 * Interpolate variables into a template.
 *
 * Replaces all `{{varName}}` placeholders with the corresponding value from
 * `vars`. Unmatched placeholders are left as-is so the caller can see which
 * variables were missing rather than receiving a silently broken message.
 *
 * @throws Error if the template key does not exist.
 */
export function getTemplate(
  key: string,
  vars: Record<string, string> = {},
): string {
  const template = TEMPLATES[key as TemplateKey];
  if (template === undefined) {
    throw new Error(`Unknown template key: "${key}"`);
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_match, varName: string) => {
    const value = vars[varName];
    return value !== undefined ? value : `{{${varName}}}`;
  });
}
