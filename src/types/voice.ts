import { z } from "zod/v4";

/** Personality modes for the Voice agent */
export type PersonalityMode = "savage" | "hype" | "zen" | "mentor";

/** Sentiment categories detected from user messages */
export type SentimentCategory =
  | "positive"
  | "neutral"
  | "anxious"
  | "distressed"
  | "grief"
  | "crisis";

/** Result of sentiment analysis on a user message */
export interface SentimentResult {
  readonly sentiment: SentimentCategory;
  readonly confidence: number;
  readonly triggerKeywords: readonly string[];
}

/** A formatted message ready for delivery through a channel adapter */
export interface FormattedMessage {
  readonly text: string;
  readonly personalityMode: PersonalityMode;
  readonly locale: string;
  readonly isSafeMode: boolean;
  readonly isStealthMode: boolean;
  readonly isSimplifiedMode: boolean;
}

/** An upcoming bill included in the morning briefing */
export interface UpcomingBill {
  readonly merchantName: string;
  /** Decimal string — expected bill amount */
  readonly amount: string;
  readonly dueDate: string;
}

/** Morning briefing assembled by the Voice agent */
export interface MorningBriefing {
  /** User's preferred delivery time (default 8:00 AM local) */
  readonly deliveryTime: string;
  readonly overnightInsights: readonly Record<string, unknown>[];
  readonly pendingActions: readonly Record<string, unknown>[];
  readonly dailySnapshot: {
    /** Decimal string — current account balance */
    readonly currentBalance: string;
    /** Decimal string — yesterday's total spending */
    readonly yesterdaySpending: string;
    readonly upcomingBills: readonly UpcomingBill[];
    readonly overdraftRisk: "none" | "low" | "medium" | "high";
  };
  /** Decimal string — Phase 1 running total of missed savings */
  readonly ghostActionTotal?: string;
}

/** Zod schema for PersonalityMode validation */
export const PersonalityModeSchema = z.enum(["savage", "hype", "zen", "mentor"]);

/** Zod schema for SentimentResult validation */
export const SentimentResultSchema = z.object({
  sentiment: z.enum([
    "positive",
    "neutral",
    "anxious",
    "distressed",
    "grief",
    "crisis",
  ]),
  confidence: z.number().min(0).max(1),
  triggerKeywords: z.array(z.string()),
});
