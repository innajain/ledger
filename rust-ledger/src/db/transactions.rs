//! Transaction repository operations

use anyhow::Result;
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use sqlx::PgPool;
use crate::models::{Transaction, LineItem, Account, Asset};

/// List all transactions for a user
pub async fn list_by_user(pool: &PgPool, user_id: &str, limit: i64, offset: i64) -> Result<Vec<Transaction>> {
    let transactions = sqlx::query_as::<_, Transaction>(
        r#"SELECT id, user_id, datetime, description
           FROM transaction
           WHERE user_id = $1
           ORDER BY datetime DESC
           LIMIT $2 OFFSET $3"#
    )
    .bind(user_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    
    Ok(transactions)
}

/// Find transaction by ID
pub async fn find_by_id(pool: &PgPool, id: &str, user_id: &str) -> Result<Option<Transaction>> {
    let transaction = sqlx::query_as::<_, Transaction>(
        r#"SELECT id, user_id, datetime, description
           FROM transaction
           WHERE id = $1 AND user_id = $2"#
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    
    Ok(transaction)
}

/// Get line items for a transaction
pub async fn get_line_items(pool: &PgPool, transaction_id: &str) -> Result<Vec<LineItem>> {
    let line_items = sqlx::query_as::<_, LineItem>(
        r#"SELECT id, transaction_id, account_id, asset_id, quantity, book_value, description, datetime
           FROM line_item
           WHERE transaction_id = $1"#
    )
    .bind(transaction_id)
    .fetch_all(pool)
    .await?;
    
    Ok(line_items)
}

/// Create a new transaction with line items
pub async fn create(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    datetime: DateTime<Utc>,
    description: Option<&str>,
    line_items: Vec<LineItemInput>,
) -> Result<Transaction> {
    let mut tx = pool.begin().await?;
    
    // Create transaction
    let transaction = sqlx::query_as::<_, Transaction>(
        r#"INSERT INTO transaction (id, user_id, datetime, description)
           VALUES ($1, $2, $3, $4)
           RETURNING id, user_id, datetime, description"#
    )
    .bind(id)
    .bind(user_id)
    .bind(datetime)
    .bind(description)
    .fetch_one(&mut *tx)
    .await?;
    
    // Create line items
    for (index, li) in line_items.iter().enumerate() {
        let li_id = format!("{}-{}", id, index);
        sqlx::query(
            r#"INSERT INTO line_item (id, transaction_id, account_id, asset_id, quantity, book_value, description, datetime)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#
        )
        .bind(&li_id)
        .bind(id)
        .bind(&li.account_id)
        .bind(&li.asset_id)
        .bind(&li.quantity)
        .bind(&li.book_value)
        .bind(&li.description)
        .bind(&li.datetime)
        .execute(&mut *tx)
        .await?;
    }
    
    tx.commit().await?;
    
    Ok(transaction)
}

/// Delete a transaction and its line items
pub async fn delete(pool: &PgPool, id: &str, user_id: &str) -> Result<()> {
    // Line items are deleted via CASCADE
    sqlx::query("DELETE FROM transaction WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?;
    
    Ok(())
}

/// Update a transaction
pub async fn update(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    datetime: Option<DateTime<Utc>>,
    description: Option<Option<&str>>,
    line_items: Option<Vec<LineItemInput>>,
) -> Result<Transaction> {
    let mut tx = pool.begin().await?;
    
    let current = find_by_id(pool, id, user_id).await?
        .ok_or_else(|| anyhow::anyhow!("Transaction not found"))?;
    
    let new_datetime = datetime.unwrap_or(current.datetime);
    let new_description = description.unwrap_or(current.description.as_deref());
    
    // Update transaction
    let transaction = sqlx::query_as::<_, Transaction>(
        r#"UPDATE transaction
           SET datetime = $3, description = $4
           WHERE id = $1 AND user_id = $2
           RETURNING id, user_id, datetime, description"#
    )
    .bind(id)
    .bind(user_id)
    .bind(new_datetime)
    .bind(new_description)
    .fetch_one(&mut *tx)
    .await?;
    
    // If line items are provided, replace them
    if let Some(line_items) = line_items {
        // Delete existing line items
        sqlx::query("DELETE FROM line_item WHERE transaction_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        
        // Create new line items
        for (index, li) in line_items.iter().enumerate() {
            let li_id = format!("{}-{}", id, index);
            sqlx::query(
                r#"INSERT INTO line_item (id, transaction_id, account_id, asset_id, quantity, book_value, description, datetime)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#
            )
            .bind(&li_id)
            .bind(id)
            .bind(&li.account_id)
            .bind(&li.asset_id)
            .bind(&li.quantity)
            .bind(&li.book_value)
            .bind(&li.description)
            .bind(&li.datetime)
            .execute(&mut *tx)
            .await?;
        }
    }
    
    tx.commit().await?;
    
    Ok(transaction)
}

/// Line item input for creating/updating transactions
#[derive(Debug, Clone)]
pub struct LineItemInput {
    pub account_id: String,
    pub asset_id: String,
    pub quantity: Decimal,
    pub book_value: Option<Decimal>,
    pub description: Option<String>,
    pub datetime: Option<DateTime<Utc>>,
}

/// Get accounts by IDs
pub async fn get_accounts_by_ids(pool: &PgPool, ids: &[String], user_id: &str) -> Result<Vec<Account>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    
    // Build a query with IN clause
    let placeholders: Vec<String> = ids.iter().enumerate()
        .map(|(i, _)| format!("${}", i + 2))
        .collect();
    let query = format!(
        r#"SELECT id, user_id, name, type as account_type, parent_id
           FROM account
           WHERE id IN ({}) AND user_id = $1"#,
        placeholders.join(", ")
    );
    
    let mut q = sqlx::query_as::<_, Account>(&query).bind(user_id);
    for id in ids {
        q = q.bind(id);
    }
    
    let accounts = q.fetch_all(pool).await?;
    Ok(accounts)
}

/// Get assets by IDs
pub async fn get_assets_by_ids(pool: &PgPool, ids: &[String], user_id: &str) -> Result<Vec<Asset>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    
    // Build a query with IN clause
    let placeholders: Vec<String> = ids.iter().enumerate()
        .map(|(i, _)| format!("${}", i + 2))
        .collect();
    let query = format!(
        r#"SELECT id, user_id, name, type as asset_type, ticker, parent_id
           FROM asset
           WHERE id IN ({}) AND user_id = $1"#,
        placeholders.join(", ")
    );
    
    let mut q = sqlx::query_as::<_, Asset>(&query).bind(user_id);
    for id in ids {
        q = q.bind(id);
    }
    
    let assets = q.fetch_all(pool).await?;
    Ok(assets)
}
