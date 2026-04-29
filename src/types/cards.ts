/** Card types for shareable OG images */
export type ShareableCardType = "action" | "weekly_summary" | "monthly_summary" | "milestone";

/** A shareable card generated via @vercel/og — the output IS the marketing */
export interface ShareableCard {
  /** URL to the rendered OG image (1200x630) */
  readonly imageUrl: string;
  /** Unique short URL with referral tracking */
  readonly shortUrl: string;
  readonly referralCode: string;
  readonly inviteLink: string;
}

/** A savings milestone achievement */
export interface SavingsMilestone {
  readonly userId: string;
  readonly milestoneType: string;
  /** Decimal string — total savings amount at milestone */
  readonly totalSavings: string;
  readonly achievedAt: string;
  readonly description: string;
}
