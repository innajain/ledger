//! Ledger - Personal Finance Management System
//! A full-stack Rust application for tracking accounts, assets, and transactions.

mod api;
mod auth;
mod db;
mod models;
mod services;

use axum::{
    Router,
    routing::{get, post, put, delete},
    http::Method,
};
use tower_http::{
    cors::{CorsLayer, Any},
    trace::TraceLayer,
    compression::CompressionLayer,
};
use tower_cookies::CookieManagerLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use std::net::SocketAddr;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load environment variables
    dotenvy::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "ledger=debug,tower_http=debug".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Initialize database connection pool
    let pool = db::create_pool().await?;
    
    // Run migrations
    db::run_migrations(&pool).await?;

    // Build application state
    let state = api::AppState::new(pool);

    // Build the router
    let app = build_router(state);

    // Start the server
    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    tracing::info!("Starting server at http://{}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

fn build_router(state: api::AppState) -> Router {
    // CORS configuration
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_origin(Any)
        .allow_headers(Any);

    // API routes
    let api_routes = Router::new()
        // Auth routes
        .route("/auth/signup", post(api::auth::sign_up))
        .route("/auth/login", post(api::auth::log_in))
        .route("/auth/logout", post(api::auth::log_out))
        .route("/auth/me", get(api::auth::get_current_user))
        .route("/auth/password", put(api::auth::change_password))
        .route("/auth/username", put(api::auth::change_username))
        // Account routes
        .route("/accounts", get(api::accounts::list_accounts))
        .route("/accounts", post(api::accounts::create_account))
        .route("/accounts/:id", get(api::accounts::get_account))
        .route("/accounts/:id", put(api::accounts::update_account))
        .route("/accounts/:id", delete(api::accounts::delete_account))
        // Asset routes
        .route("/assets", get(api::assets::list_assets))
        .route("/assets", post(api::assets::create_asset))
        .route("/assets/:id", get(api::assets::get_asset))
        .route("/assets/:id", put(api::assets::update_asset))
        .route("/assets/:id", delete(api::assets::delete_asset))
        // Transaction routes
        .route("/transactions", get(api::transactions::list_transactions))
        .route("/transactions", post(api::transactions::create_transaction))
        .route("/transactions/:id", get(api::transactions::get_transaction))
        .route("/transactions/:id", put(api::transactions::update_transaction))
        .route("/transactions/:id", delete(api::transactions::delete_transaction))
        // Allocations routes
        .route("/allocations", get(api::allocations::list_allocations))
        // Price routes
        .route("/prices/asset/:id", get(api::prices::get_asset_price));

    Router::new()
        .nest("/api", api_routes)
        .fallback(api::static_files::serve_frontend)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())
        .layer(CookieManagerLayer::new())
        .with_state(state)
}
