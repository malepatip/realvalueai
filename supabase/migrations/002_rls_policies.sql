-- 002_rls_policies.sql
-- Row-Level Security policies for all user-data tables
-- user_isolation policy with Crew For Two partner access via couples_links
-- action_logs append-only policy (SELECT + INSERT only)

-- ============================================================
-- Enable RLS on ALL user-data tables
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghost_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE overdraft_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_vault_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE shareable_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE couples_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper: Crew For Two partner subquery
-- User sees own data + active partner's data via couples_links
-- ============================================================

-- users: own row only (no partner access to user profile)
CREATE POLICY "user_isolation" ON users
  FOR ALL USING (id = auth.uid());

-- bank_connections: own + partner
CREATE POLICY "user_isolation" ON bank_connections
  FOR ALL USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT CASE
        WHEN user_a_id = auth.uid() THEN user_b_id
        WHEN user_b_id = auth.uid() THEN user_a_id
      END
      FROM couples_links
      WHERE status = 'active'
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
  );

-- accounts: own + partner
CREATE POLICY "user_isolation" ON accounts
  FOR ALL USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT CASE
        WHEN user_a_id = auth.uid() THEN user_b_id
        WHEN user_b_id = auth.uid() THEN user_a_id
      END
      FROM couples_links
      WHERE status = 'active'
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
  );


-- transactions: own + partner (as shown in design doc)
CREATE POLICY "user_isolation" ON transactions
  FOR ALL USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT CASE
        WHEN user_a_id = auth.uid() THEN user_b_id
        WHEN user_b_id = auth.uid() THEN user_a_id
      END
      FROM couples_links
      WHERE status = 'active'
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
  );

-- recurring_charges: own + partner
CREATE POLICY "user_isolation" ON recurring_charges
  FOR ALL USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT CASE
        WHEN user_a_id = auth.uid() THEN user_b_id
        WHEN user_b_id = auth.uid() THEN user_a_id
      END
      FROM couples_links
      WHERE status = 'active'
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
  );

-- agent_actions: own + partner
CREATE POLICY "user_isolation" ON agent_actions
  FOR ALL USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT CASE
        WHEN user_a_id = auth.uid() THEN user_b_id
        WHEN user_b_id = auth.uid() THEN user_a_id
      END
      FROM couples_links
      WHERE status = 'active'
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
  );

-- ============================================================
-- action_logs: APPEND-ONLY (SELECT + INSERT only, no UPDATE/DELETE)
-- ============================================================
CREATE POLICY "action_logs_read" ON action_logs
  FOR SELECT USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT CASE
        WHEN user_a_id = auth.uid() THEN user_b_id
        WHEN user_b_id = auth.uid() THEN user_a_id
      END
      FROM couples_links
      WHERE status = 'active'
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
  );

CREATE POLICY "action_logs_insert" ON action_logs
  FOR INSERT WITH CHECK (TRUE);
-- No UPDATE or DELETE policies — append-only enforcement via RLS

-- ghost_actions: own + partner
CREATE POLICY "user_isolation" ON ghost_actions
  FOR ALL USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT CASE
        WHEN user_a_id = auth.uid() THEN user_b_id
        WHEN user_b_id = auth.uid() THEN user_a_id
      END
      FROM couples_links
      WHERE status = 'active'
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
  );

-- overdraft_predictions: own + partner
CREATE POLICY "user_isolation" ON overdraft_predictions
  FOR ALL USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT CASE
        WHEN user_a_id = auth.uid() THEN user_b_id
        WHEN user_b_id = auth.uid() THEN user_a_id
      END
      FROM couples_links
      WHERE status = 'active'
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
  );

-- credential_vault_entries: own data ONLY (no partner access — security sensitive)
CREATE POLICY "user_isolation" ON credential_vault_entries
  FOR ALL USING (user_id = auth.uid());

-- notification_queue: own data only
CREATE POLICY "user_isolation" ON notification_queue
  FOR ALL USING (user_id = auth.uid());

-- shareable_cards: own + partner
CREATE POLICY "user_isolation" ON shareable_cards
  FOR ALL USING (
    user_id = auth.uid()
    OR user_id IN (
      SELECT CASE
        WHEN user_a_id = auth.uid() THEN user_b_id
        WHEN user_b_id = auth.uid() THEN user_a_id
      END
      FROM couples_links
      WHERE status = 'active'
        AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
    )
  );

-- referrals: own data only (referrer sees their referrals)
CREATE POLICY "user_isolation" ON referrals
  FOR ALL USING (referrer_user_id = auth.uid());

-- subscription_tiers: own data only
CREATE POLICY "user_isolation" ON subscription_tiers
  FOR ALL USING (user_id = auth.uid());

-- couples_links: either partner can see the link
CREATE POLICY "user_isolation" ON couples_links
  FOR ALL USING (user_a_id = auth.uid() OR user_b_id = auth.uid());

-- user_preferences: own data only
CREATE POLICY "user_isolation" ON user_preferences
  FOR ALL USING (user_id = auth.uid());
