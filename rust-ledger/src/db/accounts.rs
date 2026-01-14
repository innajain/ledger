//! Account repository operations

use anyhow::Result;
use sqlx::{PgPool, Row};
use crate::models::{Account, AccountType};

/// List all accounts for a user
pub async fn list_by_user(pool: &PgPool, user_id: &str) -> Result<Vec<Account>> {
    let accounts = sqlx::query_as::<_, Account>(
        r#"SELECT id, user_id, name, type as account_type, parent_id
           FROM account
           WHERE user_id = $1
           ORDER BY name"#
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    
    Ok(accounts)
}

/// List accounts by type for a user
pub async fn list_by_type(pool: &PgPool, user_id: &str, account_type: AccountType) -> Result<Vec<Account>> {
    let accounts = sqlx::query_as::<_, Account>(
        r#"SELECT id, user_id, name, type as account_type, parent_id
           FROM account
           WHERE user_id = $1 AND type = $2
           ORDER BY name"#
    )
    .bind(user_id)
    .bind(account_type)
    .fetch_all(pool)
    .await?;
    
    Ok(accounts)
}

/// Find account by ID
pub async fn find_by_id(pool: &PgPool, id: &str, user_id: &str) -> Result<Option<Account>> {
    let account = sqlx::query_as::<_, Account>(
        r#"SELECT id, user_id, name, type as account_type, parent_id
           FROM account
           WHERE id = $1 AND user_id = $2"#
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    
    Ok(account)
}

/// Create a new account
pub async fn create(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    name: &str,
    account_type: AccountType,
    parent_id: Option<&str>,
) -> Result<Account> {
    let account = sqlx::query_as::<_, Account>(
        r#"INSERT INTO account (id, user_id, name, type, parent_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, user_id, name, type as account_type, parent_id"#
    )
    .bind(id)
    .bind(user_id)
    .bind(name)
    .bind(account_type)
    .bind(parent_id)
    .fetch_one(pool)
    .await?;
    
    Ok(account)
}

/// Update an account
pub async fn update(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    name: Option<&str>,
    account_type: Option<AccountType>,
    parent_id: Option<Option<&str>>,
) -> Result<Account> {
    // Build dynamic update query
    let current = find_by_id(pool, id, user_id).await?
        .ok_or_else(|| anyhow::anyhow!("Account not found"))?;
    
    let new_name = name.unwrap_or(&current.name);
    let new_type = account_type.unwrap_or(current.account_type);
    let new_parent_id = parent_id.unwrap_or(current.parent_id.as_deref());
    
    let account = sqlx::query_as::<_, Account>(
        r#"UPDATE account
           SET name = $3, type = $4, parent_id = $5
           WHERE id = $1 AND user_id = $2
           RETURNING id, user_id, name, type as account_type, parent_id"#
    )
    .bind(id)
    .bind(user_id)
    .bind(new_name)
    .bind(new_type)
    .bind(new_parent_id)
    .fetch_one(pool)
    .await?;
    
    Ok(account)
}

/// Delete an account
pub async fn delete(pool: &PgPool, id: &str, user_id: &str) -> Result<()> {
    sqlx::query("DELETE FROM account WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?;
    
    Ok(())
}

/// Check if account exists and belongs to user
pub async fn exists(pool: &PgPool, id: &str, user_id: &str) -> Result<bool> {
    let row = sqlx::query("SELECT EXISTS(SELECT 1 FROM account WHERE id = $1 AND user_id = $2) as exists")
        .bind(id)
        .bind(user_id)
        .fetch_one(pool)
        .await?;
    
    let exists: bool = row.try_get("exists").unwrap_or(false);
    Ok(exists)
}
