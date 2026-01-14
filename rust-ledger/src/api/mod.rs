//! API handlers and routes

use axum::extract::FromRef;
use sqlx::PgPool;

pub mod accounts;
pub mod allocations;
pub mod assets;
pub mod auth;
pub mod prices;
pub mod static_files;
pub mod transactions;

/// Application state shared across handlers
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
}

impl AppState {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

// Allow extracting pool directly from state
impl FromRef<AppState> for PgPool {
    fn from_ref(state: &AppState) -> Self {
        state.pool.clone()
    }
}
