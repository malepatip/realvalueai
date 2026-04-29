/**
 * Database row types matching ALL Supabase tables.
 * All monetary fields are typed as `string` (decimal string representation, never `number`).
 * These types mirror the PostgreSQL schema defined in supabase/migrations/.
 */

import type { TrustPhase } from "./trust";
import type { PersonalityMode } from "./voice";

/** User row — canonical identity is phone number */
export interface User {
  readonly id: string;
  readonly phone_number: string;
  readonly telegram_user_id: string | null;
  readonly whatsapp_number: string | null;
  readonly display_name: string | null;
  readonly trust_phase: TrustPhase;
  readonly subscription_tier: "free" | "premium" | "hardship";
  readonly personality_mode: PersonalityMode;
  readonly locale: string;
  readonly safe_mode_enabled: boolean;
  readonly safe_mode_code_word: string | null;
  readonly safe_mode_cover_topic: string;
  readonly stealth_mode_enabled: boolean;
  readonly simplified_mode_enabled: boolean;
  readonly survival_mode_active: boolean;
  readonly survival_mode_activated_at: string | null;
  readonly is_minor: boolean;
  readonly immigration_status_confirmed: boolean;
  readonly immigration_eligible: boolean | null;
  readonly religious_finance_prefs: unknown[];
  readonly notification_pause_until: string | null;
  readonly morning_briefing_time: string;
  readonly timezone: string;
  readonly affiliates_enabled: boolean;
  readonly kyc_verified: boolean;
  readonly kyc_verified_at: string | null;
  readonly phase2_approval_count: number;
  readonly phase2_total_actions: number;
  readonly trusted_contact_phone: string | null;
  readonly onboarding_completed: boolean;
  readonly is_deleted: boolean;
  readonly deleted_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Bank connection row */
export interface BankConnection {
  readonly id: string;
  readonly user_id: string;
  readonly provider: "plaid" | "simplefin";
  readonly access_token_encrypted: string;
  readonly institution_name: string | null;
  readonly institution_id: string | null;
  readonly status: "active" | "disconnected" | "error" | "revoked";
  readonly last_sync_at: string | null;
  readonly is_deleted: boolean;
  readonly deleted_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Account row */
export interface Account {
  readonly id: string;
  readonly user_id: string;
  readonly bank_connection_id: string;
  readonly account_id_external: string;
  readonly account_name: string | null;
  readonly account_type: string | null;
  /** Last 4 digits only — never full account number */
  readonly account_mask: string | null;
  /** Decimal string — current balance */
  readonly current_balance: string | null;
  /** Decimal string — available balance */
  readonly available_balance: string | null;
  readonly currency: string;
  readonly is_deleted: boolean;
  readonly deleted_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Transaction row */
export interface Transaction {
  readonly id: string;
  readonly user_id: string;
  readonly account_id: string;
  readonly transaction_id_external: string | null;
  /** Decimal string — transaction amount */
  readonly amount: string;
  readonly merchant_name: string | null;
  readonly merchant_category: string | null;
  readonly category_rule_matched: string | null;
  /** Decimal string — categorization confidence (0.0000 to 1.0000) */
  readonly category_confidence: string | null;
  readonly description: string | null;
  readonly transaction_date: string;
  readonly posted_at: string | null;
  readonly is_recurring: boolean;
  readonly recurring_charge_id: string | null;
  readonly is_deleted: boolean;
  readonly deleted_at: string | null;
  readonly created_at: string;
}

/** Recurring charge row */
export interface RecurringChargeRow {
  readonly id: string;
  readonly user_id: string;
  readonly merchant_name: string;
  /** Decimal string — current charge amount */
  readonly amount: string;
  /** Decimal string — previous charge amount */
  readonly previous_amount: string | null;
  readonly frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";
  readonly next_expected_date: string | null;
  readonly last_charged_date: string | null;
  readonly last_usage_date: string | null;
  readonly days_since_usage: number | null;
  readonly is_trial: boolean;
  readonly trial_end_date: string | null;
  readonly status: "active" | "unused" | "cancelled" | "paused";
  readonly is_deleted: boolean;
  readonly deleted_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Agent action row */
export interface AgentAction {
  readonly id: string;
  readonly user_id: string;
  readonly agent: string;
  readonly action_type: string;
  readonly target_merchant: string | null;
  readonly target_account_id: string | null;
  /** Decimal string — estimated savings */
  readonly estimated_savings: string | null;
  /** Decimal string — actual savings achieved */
  readonly actual_savings: string | null;
  /** Decimal string — financial impact */
  readonly financial_impact: string | null;
  readonly status:
    | "pending"
    | "approved"
    | "executing"
    | "delayed"
    | "complete"
    | "failed"
    | "rejected"
    | "snoozed"
    | "cancelled";
  readonly approval_required: boolean;
  readonly approved_at: string | null;
  readonly executed_at: string | null;
  readonly destructive_delay_until: string | null;
  readonly fallback_method: string | null;
  readonly tier: string | null;
  readonly undo_window_until: string | null;
  readonly is_ghost: boolean;
  readonly screenshots: unknown[];
  readonly error_message: string | null;
  readonly correlation_id: string | null;
  readonly is_deleted: boolean;
  readonly deleted_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Action log row — APPEND-ONLY (no UPDATE or DELETE) */
export interface ActionLog {
  readonly id: string;
  readonly user_id: string;
  readonly action_id: string | null;
  readonly agent: string;
  readonly action_type: string;
  readonly target: string | null;
  readonly approval_status: string | null;
  readonly screenshot_refs: unknown[];
  readonly outcome: string | null;
  readonly details: Record<string, unknown> | null;
  readonly created_at: string;
}

/** Ghost action row */
export interface GhostActionRow {
  readonly id: string;
  readonly user_id: string;
  readonly insight_type: string;
  readonly description: string;
  /** Decimal string — estimated savings */
  readonly estimated_savings: string;
  readonly target_merchant: string | null;
  readonly created_at: string;
}

/** Overdraft prediction row */
export interface OverdraftPredictionRow {
  readonly id: string;
  readonly user_id: string;
  readonly predicted_date: string;
  /** Decimal string — predicted shortfall */
  readonly predicted_shortfall: string;
  /** Decimal string — current balance */
  readonly current_balance: string;
  /** Decimal string — projected expenses */
  readonly projected_expenses: string;
  /** Decimal string — safety buffer applied (e.g., 0.2000 for 20%) */
  readonly safety_buffer_applied: string;
  readonly suggested_actions: unknown[];
  /** Decimal string — confidence (0.0000 to 1.0000) */
  readonly confidence: string;
  readonly actual_outcome: string | null;
  readonly guarantee_claimed: boolean;
  /** Decimal string — guarantee amount */
  readonly guarantee_amount: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Credential vault entry row */
export interface CredentialVaultEntry {
  readonly id: string;
  readonly user_id: string;
  readonly service_name: string;
  readonly service_url: string | null;
  /** Encrypted credential blob — BYTEA stored as base64 */
  readonly encrypted_blob: string;
  readonly salt: string;
  readonly iv: string;
  readonly auth_tag: string;
  readonly is_locked: boolean;
  readonly is_deleted: boolean;
  readonly deleted_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Notification queue item row */
export interface NotificationQueueItem {
  readonly id: string;
  readonly user_id: string;
  readonly notification_type: string;
  readonly urgency: "immediate" | "batched";
  readonly content: Record<string, unknown>;
  readonly channel: string | null;
  readonly delivered: boolean;
  readonly delivered_at: string | null;
  readonly batched_for: string | null;
  readonly created_at: string;
}

/** Shareable card row */
export interface ShareableCardRow {
  readonly id: string;
  readonly user_id: string;
  readonly card_type: "action" | "weekly_summary" | "monthly_summary" | "milestone";
  readonly action_id: string | null;
  readonly card_data: Record<string, unknown>;
  readonly short_code: string;
  readonly referral_code: string;
  readonly image_url: string | null;
  readonly click_count: number;
  readonly created_at: string;
}

/** Referral row */
export interface Referral {
  readonly id: string;
  readonly referrer_user_id: string;
  readonly referred_user_id: string | null;
  readonly shareable_card_id: string | null;
  readonly referral_code: string;
  readonly status: "clicked" | "signed_up" | "active";
  readonly created_at: string;
  readonly updated_at: string;
}

/** Subscription tier row */
export interface SubscriptionTier {
  readonly id: string;
  readonly user_id: string;
  readonly tier: "free" | "premium" | "hardship";
  /** Decimal string — monthly price */
  readonly price_monthly: string;
  readonly started_at: string;
  readonly expires_at: string | null;
  readonly trial_ends_at: string | null;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Couples link row */
export interface CouplesLink {
  readonly id: string;
  readonly user_a_id: string;
  readonly user_b_id: string | null;
  readonly status: "pending" | "active" | "disconnected";
  readonly invite_code: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** User preferences row */
export interface UserPreferences {
  readonly id: string;
  readonly user_id: string;
  readonly blocked_merchants: unknown[];
  readonly primary_channel: string;
  readonly cultural_preferences: Record<string, unknown>;
  readonly financial_goals: unknown[];
  readonly life_stage: string | null;
  readonly life_stage_priorities: Record<string, unknown>;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Compatibility score row */
export interface CompatibilityScoreRow {
  readonly id: string;
  readonly provider_name: string;
  readonly provider_url: string | null;
  readonly automation_method: string;
  /** Decimal string — success rate (0.0000 to 1.0000) */
  readonly success_rate: string;
  readonly last_tested_at: string | null;
  readonly failure_reason: string | null;
  readonly total_attempts: number;
  readonly total_successes: number;
  readonly updated_at: string;
}

/** Agent event log row — append-only */
export interface AgentEventLog {
  readonly id: string;
  readonly agent: string;
  readonly event_type: string;
  readonly user_id: string | null;
  readonly payload: Record<string, unknown>;
  readonly correlation_id: string | null;
  readonly created_at: string;
}
