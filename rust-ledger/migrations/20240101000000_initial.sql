-- Initial migration: Create all tables for the Ledger application

-- Create custom enum types
CREATE TYPE account_type AS ENUM ('real', 'nominal', 'allocation');
CREATE TYPE asset_type AS ENUM ('rupees', 'mf', 'etf', 'shares', 'other');

-- Users table
CREATE TABLE "user" (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL
);

-- Accounts table with hierarchical structure
CREATE TABLE account (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES "user"(id),
    name VARCHAR(255) NOT NULL,
    type account_type NOT NULL,
    parent_id VARCHAR(255) REFERENCES account(id),
    UNIQUE(name, user_id)
);

CREATE INDEX idx_account_user_type ON account(user_id, type);
CREATE INDEX idx_account_parent ON account(parent_id);

-- Assets table with hierarchical structure  
CREATE TABLE asset (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES "user"(id),
    name VARCHAR(255) NOT NULL,
    type asset_type NOT NULL,
    ticker VARCHAR(255),
    parent_id VARCHAR(255) REFERENCES asset(id),
    UNIQUE(name, user_id)
);

CREATE INDEX idx_asset_user ON asset(user_id);
CREATE INDEX idx_asset_parent ON asset(parent_id);

-- Transactions table
CREATE TABLE transaction (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES "user"(id),
    datetime TIMESTAMPTZ NOT NULL,
    description TEXT
);

CREATE INDEX idx_transaction_user ON transaction(user_id);
CREATE INDEX idx_transaction_datetime ON transaction(datetime);

-- Line items table (entries in transactions)
CREATE TABLE line_item (
    id VARCHAR(255) PRIMARY KEY,
    transaction_id VARCHAR(255) NOT NULL REFERENCES transaction(id) ON DELETE CASCADE,
    account_id VARCHAR(255) NOT NULL REFERENCES account(id),
    asset_id VARCHAR(255) NOT NULL REFERENCES asset(id),
    quantity DECIMAL(14, 4) NOT NULL,
    book_value DECIMAL(14, 4),
    description TEXT,
    datetime TIMESTAMPTZ
);

CREATE INDEX idx_line_item_transaction ON line_item(transaction_id);
CREATE INDEX idx_line_item_account ON line_item(account_id);
CREATE INDEX idx_line_item_asset ON line_item(asset_id);
