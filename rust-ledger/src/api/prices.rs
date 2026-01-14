//! Price API handlers

use axum::{
    Json,
    extract::{State, Path},
    http::StatusCode,
};
use tower_cookies::Cookies;
use crate::api::AppState;
use crate::api::auth::get_user_from_cookie;
use crate::db;
use crate::models::{PriceData, ApiResponse};
use crate::services::price_fetcher;

/// Get current price for an asset
pub async fn get_asset_price(
    State(state): State<AppState>,
    cookies: Cookies,
    Path(id): Path<String>,
) -> (StatusCode, Json<ApiResponse<PriceData>>) {
    let user = match get_user_from_cookie(&cookies, &state.pool).await {
        Some(user) => user,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::error("Not authenticated")),
            );
        }
    };

    // Get the asset
    let asset = match db::assets::find_by_id(&state.pool, &id, &user.id).await {
        Ok(Some(asset)) => asset,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(ApiResponse::error("Asset not found")),
            );
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::error(format!("Failed to get asset: {}", e))),
            );
        }
    };

    // Fetch price
    match price_fetcher::get_price_for_asset(asset.asset_type, asset.ticker.as_deref()).await {
        Ok(Some(price)) => (
            StatusCode::OK,
            Json(ApiResponse::success(price, "Price retrieved")),
        ),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::error("Price not available for this asset")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to fetch price: {}", e))),
        ),
    }
}
