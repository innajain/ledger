//! Database connection and operations

use anyhow::Result;
use sqlx::{PgPool, postgres::PgPoolOptions, Executor};
use std::time::Duration;

/// Create a PostgreSQL connection pool
pub async fn create_pool() -> Result<PgPool> {
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(30))
        .connect(&database_url)
        .await?;

    tracing::info!("Connected to PostgreSQL database");
    Ok(pool)
}

/// Run database migrations
pub async fn run_migrations(pool: &PgPool) -> Result<()> {
    tracing::info!("Running database migrations...");
    
    // Read and execute migration file
    let migration_sql = include_str!("../../migrations/20240101000000_initial.sql");
    
    // Check if tables already exist
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'user')"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(false);
    
    if !exists {
        // Execute migration
        pool.execute(migration_sql).await?;
        tracing::info!("Migrations completed");
    } else {
        tracing::info!("Database already initialized, skipping migrations");
    }
    
    Ok(())
}

// Re-export repository modules
pub mod accounts;
pub mod assets;
pub mod transactions;
pub mod users;
