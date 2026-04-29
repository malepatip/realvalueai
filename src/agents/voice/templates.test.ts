import { describe, it, expect } from "vitest";
import { getTemplate, TEMPLATE_KEYS } from "./templates";

describe("templates", () => {
  describe("TEMPLATE_KEYS", () => {
    it("exposes all expected template key constants", () => {
      expect(TEMPLATE_KEYS.OVERDRAFT_ALERT).toBe("overdraft_alert");
      expect(TEMPLATE_KEYS.ACTION_CONFIRM_APPROVE).toBe("action_confirm_approve");
      expect(TEMPLATE_KEYS.ACTION_CONFIRM_REJECT).toBe("action_confirm_reject");
      expect(TEMPLATE_KEYS.ACTION_CONFIRM_COMPLETE).toBe("action_confirm_complete");
      expect(TEMPLATE_KEYS.ACTION_CONFIRM_FAILED).toBe("action_confirm_failed");
      expect(TEMPLATE_KEYS.ERROR_NOTIFICATION).toBe("error_notification");
      expect(TEMPLATE_KEYS.KILL_SWITCH_CONFIRMATION).toBe("kill_switch_confirmation");
      expect(TEMPLATE_KEYS.ONBOARDING_CREW_INTRO).toBe("onboarding_crew_intro");
      expect(TEMPLATE_KEYS.ONBOARDING_PERSONALITY_SELECTION).toBe("onboarding_personality_selection");
      expect(TEMPLATE_KEYS.ONBOARDING_GOAL_QUESTION).toBe("onboarding_goal_question");
      expect(TEMPLATE_KEYS.MORNING_BRIEFING).toBe("morning_briefing");
      expect(TEMPLATE_KEYS.GHOST_ACTION).toBe("ghost_action");
      expect(TEMPLATE_KEYS.UNUSED_SUBSCRIPTION).toBe("unused_subscription");
      expect(TEMPLATE_KEYS.BILL_INCREASE).toBe("bill_increase");
      expect(TEMPLATE_KEYS.TRIAL_EXPIRING).toBe("trial_expiring");
    });
  });

  describe("getTemplate", () => {
    it("renders overdraft alert with all variables", () => {
      const result = getTemplate(TEMPLATE_KEYS.OVERDRAFT_ALERT, {
        accountLast4: "7890",
        shortfallAmount: "$150.00",
        predictedDate: "March 15",
        currentBalance: "$42.50",
      });

      expect(result).toContain("7890");
      expect(result).toContain("$150.00");
      expect(result).toContain("March 15");
      expect(result).toContain("$42.50");
      expect(result).not.toContain("{{");
    });

    it("renders action confirmation approve", () => {
      const result = getTemplate(TEMPLATE_KEYS.ACTION_CONFIRM_APPROVE, {
        actionDescription: "Cancel Netflix",
      });

      expect(result).toContain("Cancel Netflix");
      expect(result).toContain("approved");
    });

    it("renders action confirmation complete with savings", () => {
      const result = getTemplate(TEMPLATE_KEYS.ACTION_CONFIRM_COMPLETE, {
        actionDescription: "Cancel Hulu",
        savingsAmount: "$15.99/mo",
      });

      expect(result).toContain("Cancel Hulu");
      expect(result).toContain("$15.99/mo");
      expect(result).toContain("completed");
    });

    it("renders action confirmation failed with reason", () => {
      const result = getTemplate(TEMPLATE_KEYS.ACTION_CONFIRM_FAILED, {
        actionDescription: "Cancel gym membership",
        failureReason: "CAPTCHA required",
      });

      expect(result).toContain("Cancel gym membership");
      expect(result).toContain("CAPTCHA required");
    });

    it("renders ghost action message", () => {
      const result = getTemplate(TEMPLATE_KEYS.GHOST_ACTION, {
        savingsAmount: "$180",
        actionDescription: "cancelling your unused Spotify",
        runningTotal: "$420",
      });

      expect(result).toContain("$180");
      expect(result).toContain("cancelling your unused Spotify");
      expect(result).toContain("$420");
    });

    it("renders unused subscription template", () => {
      const result = getTemplate(TEMPLATE_KEYS.UNUSED_SUBSCRIPTION, {
        amount: "$15",
        merchantName: "Planet Fitness",
        daysSinceUsage: "90",
      });

      expect(result).toContain("$15");
      expect(result).toContain("Planet Fitness");
      expect(result).toContain("90");
    });

    it("renders bill increase template", () => {
      const result = getTemplate(TEMPLATE_KEYS.BILL_INCREASE, {
        merchantName: "Netflix",
        previousAmount: "$15.49",
        newAmount: "$22.99",
        percentageChange: "48",
      });

      expect(result).toContain("Netflix");
      expect(result).toContain("$15.49");
      expect(result).toContain("$22.99");
      expect(result).toContain("48%");
    });

    it("renders trial expiring template", () => {
      const result = getTemplate(TEMPLATE_KEYS.TRIAL_EXPIRING, {
        merchantName: "Adobe Creative Cloud",
        daysRemaining: "2",
        chargeAmount: "$54.99",
      });

      expect(result).toContain("Adobe Creative Cloud");
      expect(result).toContain("2 days");
      expect(result).toContain("$54.99");
    });

    it("renders morning briefing with all variables", () => {
      const result = getTemplate(TEMPLATE_KEYS.MORNING_BRIEFING, {
        currentBalance: "$2,450.00",
        yesterdaySpending: "$87.32",
        upcomingBillsSummary: "Netflix ($22.99), Rent ($1,500)",
        overdraftRisk: "low",
        overnightInsights: "No new insights overnight.\n",
        pendingActions: "No pending actions.",
      });

      expect(result).toContain("$2,450.00");
      expect(result).toContain("$87.32");
      expect(result).toContain("Netflix ($22.99)");
      expect(result).toContain("low");
    });

    it("renders kill switch confirmation without variables", () => {
      const result = getTemplate(TEMPLATE_KEYS.KILL_SWITCH_CONFIRMATION);

      expect(result).toContain("Kill switch activated");
      expect(result).toContain("halted");
      expect(result).toContain("vault is locked");
    });

    it("renders onboarding crew intro", () => {
      const result = getTemplate(TEMPLATE_KEYS.ONBOARDING_CREW_INTRO);

      expect(result).toContain("Watcher");
      expect(result).toContain("Fixer");
      expect(result).toContain("Hunter");
      expect(result).toContain("Voice");
    });

    it("renders onboarding personality selection", () => {
      const result = getTemplate(TEMPLATE_KEYS.ONBOARDING_PERSONALITY_SELECTION);

      expect(result).toContain("Savage");
      expect(result).toContain("Hype");
      expect(result).toContain("Zen");
      expect(result).toContain("Mentor");
    });

    it("leaves unmatched variables as-is for graceful degradation", () => {
      const result = getTemplate(TEMPLATE_KEYS.OVERDRAFT_ALERT, {
        accountLast4: "7890",
        // Missing: shortfallAmount, predictedDate, currentBalance
      });

      expect(result).toContain("7890");
      expect(result).toContain("{{shortfallAmount}}");
      expect(result).toContain("{{predictedDate}}");
      expect(result).toContain("{{currentBalance}}");
    });

    it("works with empty vars object", () => {
      const result = getTemplate(TEMPLATE_KEYS.OVERDRAFT_ALERT, {});

      expect(result).toContain("{{accountLast4}}");
      expect(result).toContain("{{shortfallAmount}}");
    });

    it("works with no vars argument", () => {
      const result = getTemplate(TEMPLATE_KEYS.KILL_SWITCH_CONFIRMATION);

      expect(result).toContain("Kill switch activated");
    });

    it("throws on unknown template key", () => {
      expect(() => getTemplate("nonexistent_key")).toThrow(
        'Unknown template key: "nonexistent_key"',
      );
    });
  });
});
