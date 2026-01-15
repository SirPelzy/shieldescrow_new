-- Enable RLS on all sensitive tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- POLICY: USERS (Vendors/Buyers)
-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- POLICY: WALLETS
-- Users can see their own wallet
CREATE POLICY "Users can view own ledger" ON wallets
  FOR SELECT USING (auth.uid() = user_id);

-- POLICY: TRANSACTIONS
-- Users can see transactions where they are the buyer OR the vendor
CREATE POLICY "Users see involved transactions" ON transactions
  FOR SELECT USING (
    auth.uid() = buyer_id OR 
    auth.uid() = vendor_id
  );

-- POLICY: BANK ACCOUNTS
-- Users can see own bank accounts
CREATE POLICY "Users see own bank accounts" ON bank_accounts
  FOR SELECT USING (auth.uid() = user_id);

-- POLICY: MILESTONES
-- Visible if user is part of the parent transaction
CREATE POLICY "Users see transaction milestones" ON milestones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = milestones.transaction_id
      AND (t.buyer_id = auth.uid() OR t.vendor_id = auth.uid())
    )
  );

-- POLICY: DISPUTES
-- Visible if user is part of the parent transaction
CREATE POLICY "Users see transaction disputes" ON disputes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = disputes.transaction_id
      AND (t.buyer_id = auth.uid() OR t.vendor_id = auth.uid())
    )
  );

-- NOTE: 
-- The Node.js backend connects as 'postgres'/'service_role' which BYPASSES RLS.
-- These policies are effective if you connect directly via Supabase Client (Frontend).
