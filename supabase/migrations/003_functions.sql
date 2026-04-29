-- 003_functions.sql
-- Database functions and triggers
-- soft_delete function + updated_at trigger for all tables with updated_at

-- ============================================================
-- soft_delete(table_name, record_id)
-- Sets is_deleted = TRUE and deleted_at = NOW() on the target record
-- ============================================================
CREATE OR REPLACE FUNCTION soft_delete(p_table_name TEXT, p_record_id UUID)
RETURNS VOID AS $$
BEGIN
  EXECUTE format(
    'UPDATE %I SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1',
    p_table_name
  ) USING p_record_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- updated_at trigger function
-- Automatically sets updated_at = NOW() on row update
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Apply updated_at trigger to all tables with updated_at column
-- ============================================================
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_bank_connections_updated_at
  BEFORE UPDATE ON bank_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_recurring_charges_updated_at
  BEFORE UPDATE ON recurring_charges
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_agent_actions_updated_at
  BEFORE UPDATE ON agent_actions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_overdraft_predictions_updated_at
  BEFORE UPDATE ON overdraft_predictions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_credential_vault_entries_updated_at
  BEFORE UPDATE ON credential_vault_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_referrals_updated_at
  BEFORE UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_subscription_tiers_updated_at
  BEFORE UPDATE ON subscription_tiers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_couples_links_updated_at
  BEFORE UPDATE ON couples_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_compatibility_scores_updated_at
  BEFORE UPDATE ON compatibility_scores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
