//! Asset repository operations

use anyhow::Result;
use sqlx::{PgPool, Row};
use crate::models::{Asset, AssetType};

/// List all assets for a user
pub async fn list_by_user(pool: &PgPool, user_id: &str) -> Result<Vec<Asset>> {
    let assets = sqlx::query_as::<_, Asset>(
        r#"SELECT id, user_id, name, type as asset_type, ticker, parent_id
           FROM asset
           WHERE user_id = $1
           ORDER BY name"#
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    
    Ok(assets)
}

/// Find asset by ID
pub async fn find_by_id(pool: &PgPool, id: &str, user_id: &str) -> Result<Option<Asset>> {
    let asset = sqlx::query_as::<_, Asset>(
        r#"SELECT id, user_id, name, type as asset_type, ticker, parent_id
           FROM asset
           WHERE id = $1 AND user_id = $2"#
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    
    Ok(asset)
}

/// Create a new asset
pub async fn create(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    name: &str,
    asset_type: AssetType,
    ticker: Option<&str>,
    parent_id: Option<&str>,
) -> Result<Asset> {
    let asset = sqlx::query_as::<_, Asset>(
        r#"INSERT INTO asset (id, user_id, name, type, ticker, parent_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, user_id, name, type as asset_type, ticker, parent_id"#
    )
    .bind(id)
    .bind(user_id)
    .bind(name)
    .bind(asset_type)
    .bind(ticker)
    .bind(parent_id)
    .fetch_one(pool)
    .await?;
    
    Ok(asset)
}

/// Update an asset
pub async fn update(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    name: Option<&str>,
    asset_type: Option<AssetType>,
    ticker: Option<Option<&str>>,
    parent_id: Option<Option<&str>>,
) -> Result<Asset> {
    let current = find_by_id(pool, id, user_id).await?
        .ok_or_else(|| anyhow::anyhow!("Asset not found"))?;
    
    let new_name = name.unwrap_or(&current.name);
    let new_type = asset_type.unwrap_or(current.asset_type);
    let new_ticker = ticker.unwrap_or(current.ticker.as_deref());
    let new_parent_id = parent_id.unwrap_or(current.parent_id.as_deref());
    
    let asset = sqlx::query_as::<_, Asset>(
        r#"UPDATE asset
           SET name = $3, type = $4, ticker = $5, parent_id = $6
           WHERE id = $1 AND user_id = $2
           RETURNING id, user_id, name, type as asset_type, ticker, parent_id"#
    )
    .bind(id)
    .bind(user_id)
    .bind(new_name)
    .bind(new_type)
    .bind(new_ticker)
    .bind(new_parent_id)
    .fetch_one(pool)
    .await?;
    
    Ok(asset)
}

/// Delete an asset
pub async fn delete(pool: &PgPool, id: &str, user_id: &str) -> Result<()> {
    sqlx::query("DELETE FROM asset WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?;
    
    Ok(())
}

/// Check if asset exists and belongs to user
pub async fn exists(pool: &PgPool, id: &str, user_id: &str) -> Result<bool> {
    let row = sqlx::query("SELECT EXISTS(SELECT 1 FROM asset WHERE id = $1 AND user_id = $2) as exists")
        .bind(id)
        .bind(user_id)
        .fetch_one(pool)
        .await?;
    
    let exists: bool = row.try_get("exists").unwrap_or(false);
    Ok(exists)
}
