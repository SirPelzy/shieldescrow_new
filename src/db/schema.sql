-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants (Marketplaces)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL, -- Simplified for demo
    webhook_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users (Vendors/Buyers) within a Tenant
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id),
    platform_user_id VARCHAR(255) NOT NULL, -- User ID from Jiji/etc
    email VARCHAR(255),
    role VARCHAR(50) CHECK (role IN ('buyer', 'vendor', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, platform_user_id)
);

-- Bank Accounts (for Vendors)
CREATE TABLE bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    bank_name VARCHAR(255) NOT NULL,
    account_number VARCHAR(20) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    paystack_recipient_code VARCHAR(255), -- For transfers
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Wallet Balances (Ledger)
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) UNIQUE,
    escrow_balance DECIMAL(15, 2) DEFAULT 0.00, -- Locked funds
    available_balance DECIMAL(15, 2) DEFAULT 0.00, -- Release funds
    withdrawn_balance DECIMAL(15, 2) DEFAULT 0.00, -- Historical payouts
    currency VARCHAR(3) DEFAULT 'NGN',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Transactions (Escrow Records)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id),
    buyer_id UUID REFERENCES users(id),
    vendor_id UUID REFERENCES users(id),
    amount DECIMAL(15, 2) NOT NULL,
    protection_fee DECIMAL(15, 2) NOT NULL,
    platform_commission DECIMAL(15, 2) DEFAULT 0.00,
    status VARCHAR(50) CHECK (status IN ('AWAITING_FUNDS', 'FUNDS_HELD', 'RELEASED', 'DISPUTED', 'REFUNDED', 'PARTIALLY_RELEASED')),
    description TEXT,
    paystack_reference VARCHAR(255), -- For tracking incoming payments
    paystack_dva_account_number VARCHAR(20), -- Dedicated Virtual Account
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Milestones (for partial releases)
CREATE TABLE milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID REFERENCES transactions(id),
    description VARCHAR(255),
    amount DECIMAL(15, 2) NOT NULL, -- Amount to release for this milestone
    status VARCHAR(50) CHECK (status IN ('PENDING', 'COMPLETED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Disputes
CREATE TABLE disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID REFERENCES transactions(id),
    reason TEXT NOT NULL,
    status VARCHAR(50) CHECK (status IN ('OPEN', 'RESOLVED_BUYER', 'RESOLVED_VENDOR')),
    evidence_url VARCHAR(255), -- Link to hosted evidence folder
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Payouts (Withdrawals)
CREATE TABLE payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    amount DECIMAL(15, 2) NOT NULL,
    bank_account_id UUID REFERENCES bank_accounts(id),
    status VARCHAR(50) CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
    paystack_transfer_code VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
