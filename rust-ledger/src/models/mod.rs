//! Domain models for the Ledger application

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Account types in the double-entry bookkeeping system
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "account_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum AccountType {
    Real,
    Nominal,
    Allocation,
}

/// Asset types supported by the system
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "asset_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum AssetType {
    Rupees,
    Mf,
    Etf,
    Shares,
    Other,
}

/// User model
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
}

/// Account model with hierarchical structure
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub user_id: String,
    pub name: String,
    #[sqlx(rename = "type")]
    pub account_type: AccountType,
    pub parent_id: Option<String>,
}

/// Asset model with hierarchical structure
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Asset {
    pub id: String,
    pub user_id: String,
    pub name: String,
    #[sqlx(rename = "type")]
    pub asset_type: AssetType,
    pub ticker: Option<String>,
    pub parent_id: Option<String>,
}

/// Transaction model
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub user_id: String,
    pub datetime: DateTime<Utc>,
    pub description: Option<String>,
}

/// Line item model (entries in transactions)
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct LineItem {
    pub id: String,
    pub transaction_id: String,
    pub account_id: String,
    pub asset_id: String,
    pub quantity: Decimal,
    pub book_value: Option<Decimal>,
    pub description: Option<String>,
    pub datetime: Option<DateTime<Utc>>,
}

/// Line item with related data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineItemDetail {
    pub id: String,
    pub account: Account,
    pub asset: Asset,
    pub quantity: Decimal,
    pub book_value: Option<Decimal>,
    pub description: Option<String>,
    pub datetime: Option<DateTime<Utc>>,
}

/// Transaction with full line item details
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionDetail {
    pub id: String,
    pub datetime: DateTime<Utc>,
    pub description: Option<String>,
    pub line_items: Vec<LineItemDetail>,
}

/// Allocation summary for display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllocationSummary {
    pub id: String,
    pub name: String,
    pub total: Decimal,
}

/// Price data for assets
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceData {
    pub price: Decimal,
    pub date: DateTime<Utc>,
}

// Request/Response DTOs

#[derive(Debug, Deserialize)]
pub struct AuthRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub success: bool,
    pub message: String,
    pub user: Option<UserPublic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPublic {
    pub id: String,
    pub username: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangeUsernameRequest {
    pub new_username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAccountRequest {
    pub name: String,
    pub account_type: AccountType,
    pub parent_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAccountRequest {
    pub name: Option<String>,
    pub account_type: Option<AccountType>,
    pub parent_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAssetRequest {
    pub name: String,
    pub asset_type: AssetType,
    pub ticker: Option<String>,
    pub parent_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAssetRequest {
    pub name: Option<String>,
    pub asset_type: Option<AssetType>,
    pub ticker: Option<String>,
    pub parent_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateLineItemInput {
    pub account_id: String,
    pub asset_id: String,
    pub quantity: Decimal,
    pub book_value: Option<Decimal>,
    pub description: Option<String>,
    pub datetime: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTransactionRequest {
    pub datetime: DateTime<Utc>,
    pub description: Option<String>,
    pub line_items: Vec<CreateLineItemInput>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTransactionRequest {
    pub datetime: Option<DateTime<Utc>>,
    pub description: Option<String>,
    pub line_items: Option<Vec<CreateLineItemInput>>,
}

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T, message: impl Into<String>) -> Self {
        Self {
            success: true,
            message: message.into(),
            data: Some(data),
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            message: message.into(),
            data: None,
        }
    }
}

impl From<User> for UserPublic {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            username: user.username,
        }
    }
}
