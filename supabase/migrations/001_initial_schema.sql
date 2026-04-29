-- 001_initial_schema.sql
-- RealValue AI Financial Agent — Complete Database Schema
-- ALL monetary values: NUMERIC(19,4) — NEVER IEEE 754 floats
-- Soft deletes (is_deleted + deleted_at) instead of cascading hard deletes
-- action_logs and agent_event_logs are append-only

-- ============================================================
-- Users: canonical identity is phone number
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  telegram_user_id VARCHAR(64),
  whatsapp_number VARCHAR(20),
  display_name VARCHAR(100),
  trust_phase VARCHAR(10) NOT NULL DEFAULT 'phase_0'
    CHECK (trust_phase IN ('phase_0','phase_1','phase_2','phase_3','killed')),
  subscription_tier VARCHAR(10) NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free','premium','hardship')),
  personality_mode VARCHAR(10) NOT NULL DEFAULT 'mentor'
    CHECK (personality_mode IN ('savage','hype','zen','mentor')),
  locale VARCHAR(10) DEFAULT 'en-US',
  safe_mode_enabled BOOLEAN DEFAULT FALSE,
  safe_mode_code_word VARCHAR(50),
  safe_mode_cover_topic VARCHAR(20) DEFAULT 'weather',
  stealth_mode_enabled BOOLEAN DEFAULT FALSE,
  simplified_mode_enabled BOOLEAN DEFAULT FALSE,
  survival_mode_active BOOLEAN DEFAULT FALSE,
  survival_mode_activated_at TIMESTAMPTZ,
  is_minor BOOLEAN DEFAULT FALSE,
  immigration_status_confirmed BOOLEAN DEFAULT FALSE,
  immigration_eligible BOOLEAN,
  religious_finance_prefs JSONB DEFAULT '[]',
  notification_pause_until TIMESTAMPTZ,
  morning_briefing_time TIME DEFAULT '08:00',
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  affiliates_enabled BOOLEAN DEFAULT TRUE,
  kyc_verified BOOLEAN DEFAULT FALSE,
  kyc_verified_at TIMESTAMPTZ,
  phase2_approval_count INTEGER DEFAULT 0,
  phase2_total_actions INTEGER DEFAULT 0,
  trusted_contact_phone VARCHAR(20),
  onboarding_completed BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_telegram ON users(telegram_user_id) WHERE telegram_user_id IS NOT NULL;
CREATE INDEX idx_users_whatsapp ON users(whatsapp_number) WHERE whatsapp_number IS NOT NULL;


-- ============================================================
-- Bank Connections
-- ============================================================
CREATE TABLE bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  provider VARCHAR(10) NOT NULL CHECK (provider IN ('plaid','simplefin')),
  access_token_encrypted TEXT NOT NULL,
  institution_name VARCHAR(100),
  institution_id VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','disconnected','error','revoked')),
  last_sync_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bank_conn_user ON bank_connections(user_id) WHERE is_deleted = FALSE;

-- ============================================================
-- Accounts
-- ============================================================
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  bank_connection_id UUID NOT NULL REFERENCES bank_connections(id),
  account_id_external VARCHAR(100) NOT NULL,
  account_name VARCHAR(100),
  account_type VARCHAR(20),
  account_mask VARCHAR(4),
  current_balance NUMERIC(19,4),
  available_balance NUMERIC(19,4),
  currency VARCHAR(3) DEFAULT 'USD',
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_accounts_user ON accounts(user_id) WHERE is_deleted = FALSE;

-- ============================================================
-- Transactions
-- ============================================================
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  transaction_id_external VARCHAR(100),
  amount NUMERIC(19,4) NOT NULL,
  merchant_name VARCHAR(200),
  merchant_category VARCHAR(100),
  category_rule_matched VARCHAR(100),
  category_confidence NUMERIC(5,4),
  description TEXT,
  transaction_date DATE NOT NULL,
  posted_at TIMESTAMPTZ,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_charge_id UUID,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tx_user_date ON transactions(user_id, transaction_date DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_tx_merchant ON transactions(user_id, merchant_name) WHERE is_deleted = FALSE;

-- ============================================================
-- Recurring Charges
-- ============================================================
CREATE TABLE recurring_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  merchant_name VARCHAR(200) NOT NULL,
  amount NUMERIC(19,4) NOT NULL,
  previous_amount NUMERIC(19,4),
  frequency VARCHAR(20) NOT NULL
    CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','annual')),
  next_expected_date DATE,
  last_charged_date DATE,
  last_usage_date DATE,
  days_since_usage INTEGER,
  is_trial BOOLEAN DEFAULT FALSE,
  trial_end_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','unused','cancelled','paused')),
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recurring_user ON recurring_charges(user_id) WHERE is_deleted = FALSE;


-- ============================================================
-- Agent Actions
-- ============================================================
CREATE TABLE agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  agent VARCHAR(20) NOT NULL,
  action_type VARCHAR(30) NOT NULL,
  target_merchant VARCHAR(200),
  target_account_id UUID REFERENCES accounts(id),
  estimated_savings NUMERIC(19,4),
  actual_savings NUMERIC(19,4),
  financial_impact NUMERIC(19,4),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','executing','delayed','complete',
                       'failed','rejected','snoozed','cancelled')),
  approval_required BOOLEAN DEFAULT TRUE,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  destructive_delay_until TIMESTAMPTZ,
  fallback_method VARCHAR(20),
  tier VARCHAR(10),
  undo_window_until TIMESTAMPTZ,
  is_ghost BOOLEAN DEFAULT FALSE,
  screenshots JSONB DEFAULT '[]',
  error_message TEXT,
  correlation_id UUID,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_actions_user_status ON agent_actions(user_id, status) WHERE is_deleted = FALSE;
CREATE INDEX idx_actions_pending ON agent_actions(user_id) WHERE status = 'pending' AND is_deleted = FALSE;

-- ============================================================
-- Action Logs (APPEND-ONLY — no UPDATE or DELETE)
-- ============================================================
CREATE TABLE action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  action_id UUID REFERENCES agent_actions(id),
  agent VARCHAR(20) NOT NULL,
  action_type VARCHAR(30) NOT NULL,
  target VARCHAR(200),
  approval_status VARCHAR(20),
  screenshot_refs JSONB DEFAULT '[]',
  outcome VARCHAR(20),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- No UPDATE or DELETE grants — append-only enforcement
CREATE INDEX idx_action_logs_user ON action_logs(user_id);

-- ============================================================
-- Ghost Actions
-- ============================================================
CREATE TABLE ghost_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  insight_type VARCHAR(30) NOT NULL,
  description TEXT NOT NULL,
  estimated_savings NUMERIC(19,4) NOT NULL,
  target_merchant VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ghost_user ON ghost_actions(user_id);

-- ============================================================
-- Overdraft Predictions
-- ============================================================
CREATE TABLE overdraft_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  predicted_date DATE NOT NULL,
  predicted_shortfall NUMERIC(19,4) NOT NULL,
  current_balance NUMERIC(19,4) NOT NULL,
  projected_expenses NUMERIC(19,4) NOT NULL,
  safety_buffer_applied NUMERIC(5,4) NOT NULL,
  suggested_actions JSONB NOT NULL DEFAULT '[]',
  confidence NUMERIC(5,4) NOT NULL,
  actual_outcome VARCHAR(20),
  guarantee_claimed BOOLEAN DEFAULT FALSE,
  guarantee_amount NUMERIC(19,4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_overdraft_user ON overdraft_predictions(user_id);

-- ============================================================
-- Credential Vault Entries
-- ============================================================
CREATE TABLE credential_vault_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  service_name VARCHAR(100) NOT NULL,
  service_url VARCHAR(500),
  encrypted_blob BYTEA NOT NULL,
  salt BYTEA NOT NULL,
  iv BYTEA NOT NULL,
  auth_tag BYTEA NOT NULL,
  is_locked BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vault_user ON credential_vault_entries(user_id) WHERE is_deleted = FALSE;


-- ============================================================
-- Notification Queue
-- ============================================================
CREATE TABLE notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  notification_type VARCHAR(30) NOT NULL,
  urgency VARCHAR(10) NOT NULL CHECK (urgency IN ('immediate','batched')),
  content JSONB NOT NULL,
  channel VARCHAR(10),
  delivered BOOLEAN DEFAULT FALSE,
  delivered_at TIMESTAMPTZ,
  batched_for DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notif_pending ON notification_queue(user_id, batched_for)
  WHERE delivered = FALSE AND urgency = 'batched';

-- ============================================================
-- Shareable Cards
-- ============================================================
CREATE TABLE shareable_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  card_type VARCHAR(20) NOT NULL
    CHECK (card_type IN ('action','weekly_summary','monthly_summary','milestone')),
  action_id UUID REFERENCES agent_actions(id),
  card_data JSONB NOT NULL,
  short_code VARCHAR(20) UNIQUE NOT NULL,
  referral_code VARCHAR(20) NOT NULL,
  image_url TEXT,
  click_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cards_code ON shareable_cards(short_code);

-- ============================================================
-- Referrals
-- ============================================================
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES users(id),
  referred_user_id UUID REFERENCES users(id),
  shareable_card_id UUID REFERENCES shareable_cards(id),
  referral_code VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'clicked'
    CHECK (status IN ('clicked','signed_up','active')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_referrals_code ON referrals(referral_code);

-- ============================================================
-- Subscription Tiers
-- ============================================================
CREATE TABLE subscription_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  tier VARCHAR(10) NOT NULL CHECK (tier IN ('free','premium','hardship')),
  price_monthly NUMERIC(19,4) NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Couples Links
-- ============================================================
CREATE TABLE couples_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES users(id),
  user_b_id UUID REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','disconnected')),
  invite_code VARCHAR(20) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- User Preferences
-- ============================================================
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
  blocked_merchants JSONB DEFAULT '[]',
  primary_channel VARCHAR(10) DEFAULT 'telegram',
  cultural_preferences JSONB DEFAULT '{}',
  financial_goals JSONB DEFAULT '[]',
  life_stage VARCHAR(30),
  life_stage_priorities JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Compatibility Scores
-- ============================================================
CREATE TABLE compatibility_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name VARCHAR(200) NOT NULL,
  provider_url VARCHAR(500),
  automation_method VARCHAR(20) NOT NULL,
  success_rate NUMERIC(5,4) NOT NULL,
  last_tested_at TIMESTAMPTZ,
  failure_reason TEXT,
  total_attempts INTEGER DEFAULT 0,
  total_successes INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_compat_provider ON compatibility_scores(provider_name, automation_method);

-- ============================================================
-- Agent Event Logs (append-only)
-- ============================================================
CREATE TABLE agent_event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent VARCHAR(20) NOT NULL,
  event_type VARCHAR(30) NOT NULL,
  user_id UUID REFERENCES users(id),
  payload JSONB NOT NULL,
  correlation_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_events_time ON agent_event_logs(created_at DESC);
