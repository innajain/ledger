//! User repository operations

use anyhow::Result;
use sqlx::PgPool;
use crate::models::User;

/// Find user by ID
pub async fn find_by_id(pool: &PgPool, id: &str) -> Result<Option<User>> {
    let user = sqlx::query_as::<_, User>(
        r#"SELECT id, username, password_hash FROM "user" WHERE id = $1"#
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    
    Ok(user)
}

/// Find user by username
pub async fn find_by_username(pool: &PgPool, username: &str) -> Result<Option<User>> {
    let user = sqlx::query_as::<_, User>(
        r#"SELECT id, username, password_hash FROM "user" WHERE username = $1"#
    )
    .bind(username)
    .fetch_optional(pool)
    .await?;
    
    Ok(user)
}

/// Create a new user
pub async fn create(pool: &PgPool, id: &str, username: &str, password_hash: &str) -> Result<User> {
    let user = sqlx::query_as::<_, User>(
        r#"INSERT INTO "user" (id, username, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, username, password_hash"#
    )
    .bind(id)
    .bind(username)
    .bind(password_hash)
    .fetch_one(pool)
    .await?;
    
    Ok(user)
}

/// Update user password
pub async fn update_password(pool: &PgPool, id: &str, password_hash: &str) -> Result<()> {
    sqlx::query(r#"UPDATE "user" SET password_hash = $1 WHERE id = $2"#)
        .bind(password_hash)
        .bind(id)
        .execute(pool)
        .await?;
    
    Ok(())
}

/// Update username
pub async fn update_username(pool: &PgPool, id: &str, username: &str) -> Result<()> {
    sqlx::query(r#"UPDATE "user" SET username = $1 WHERE id = $2"#)
        .bind(username)
        .bind(id)
        .execute(pool)
        .await?;
    
    Ok(())
}
