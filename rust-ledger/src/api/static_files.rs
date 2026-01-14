//! Static file serving for frontend

use axum::{
    response::Html,
    http::StatusCode,
};

/// Serve the frontend application
/// In a full deployment, this would serve the compiled Leptos/WASM frontend
pub async fn serve_frontend() -> (StatusCode, Html<&'static str>) {
    (StatusCode::OK, Html(include_str!("../../frontend/index.html")))
}
