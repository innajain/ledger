//! Asset API handlers

use axum::{
    Json,
    extract::{State, Path},
    http::StatusCode,
};
use tower_cookies::Cookies;
use crate::api::AppState;
use crate::api::auth::get_user_from_cookie;
use crate::db;
use crate::models::{
    Asset, AssetType, CreateAssetRequest, UpdateAssetRequest, ApiResponse,
};
use crate::services::price_fetcher;

/// List all assets for the current user
pub async fn list_assets(
    State(state): State<AppState>,
    cookies: Cookies,
) -> (StatusCode, Json<ApiResponse<Vec<Asset>>>) {
    let user = match get_user_from_cookie(&cookies, &state.pool).await {
        Some(user) => user,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::error("Not authenticated")),
            );
        }
    };

    match db::assets::list_by_user(&state.pool, &user.id).await {
        Ok(assets) => (
            StatusCode::OK,
            Json(ApiResponse::success(assets, "Assets retrieved")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to list assets: {}", e))),
        ),
    }
}

/// Get a single asset by ID
pub async fn get_asset(
    State(state): State<AppState>,
    cookies: Cookies,
    Path(id): Path<String>,
) -> (StatusCode, Json<ApiResponse<Asset>>) {
    let user = match get_user_from_cookie(&cookies, &state.pool).await {
        Some(user) => user,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::error("Not authenticated")),
            );
        }
    };

    match db::assets::find_by_id(&state.pool, &id, &user.id).await {
        Ok(Some(asset)) => (
            StatusCode::OK,
            Json(ApiResponse::success(asset, "Asset retrieved")),
        ),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::error("Asset not found")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to get asset: {}", e))),
        ),
    }
}

/// Create a new asset
pub async fn create_asset(
    State(state): State<AppState>,
    cookies: Cookies,
    Json(payload): Json<CreateAssetRequest>,
) -> (StatusCode, Json<ApiResponse<Asset>>) {
    let user = match get_user_from_cookie(&cookies, &state.pool).await {
        Some(user) => user,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::error("Not authenticated")),
            );
        }
    };

    let name = payload.name.trim();
    if name.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::error("Name cannot be empty")),
        );
    }

    // Validate ticker requirements
    match payload.asset_type {
        AssetType::Etf | AssetType::Mf | AssetType::Shares => {
            let ticker = match &payload.ticker {
                Some(t) if !t.is_empty() => t,
                _ => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(ApiResponse::error(format!(
                            "Ticker is required for asset type {:?}",
                            payload.asset_type
                        ))),
                    );
                }
            };

            // Validate ticker
            match price_fetcher::validate_ticker(payload.asset_type, ticker).await {
                Ok(true) => {}
                Ok(false) => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(ApiResponse::error(format!(
                            "Invalid ticker for {:?}: {}",
                            payload.asset_type, ticker
                        ))),
                    );
                }
                Err(e) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ApiResponse::error(format!("Failed to validate ticker: {}", e))),
                    );
                }
            }
        }
        _ => {
            if payload.ticker.is_some() {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ApiResponse::error(format!(
                        "Ticker cannot be set for asset type {:?}",
                        payload.asset_type
                    ))),
                );
            }
        }
    }

    // Validate parent if provided
    if let Some(ref parent_id) = payload.parent_id {
        if !db::assets::exists(&state.pool, parent_id, &user.id).await.unwrap_or(false) {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::error("Invalid parent asset")),
            );
        }
    }

    let id = cuid2::create_id();
    match db::assets::create(
        &state.pool,
        &id,
        &user.id,
        name,
        payload.asset_type,
        payload.ticker.as_deref(),
        payload.parent_id.as_deref(),
    ).await {
        Ok(asset) => (
            StatusCode::CREATED,
            Json(ApiResponse::success(asset, "Asset created")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to create asset: {}", e))),
        ),
    }
}

/// Update an asset
pub async fn update_asset(
    State(state): State<AppState>,
    cookies: Cookies,
    Path(id): Path<String>,
    Json(payload): Json<UpdateAssetRequest>,
) -> (StatusCode, Json<ApiResponse<Asset>>) {
    let user = match get_user_from_cookie(&cookies, &state.pool).await {
        Some(user) => user,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::error("Not authenticated")),
            );
        }
    };

    if id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::error("Asset ID is required")),
        );
    }

    // Validate name if provided
    if let Some(ref name) = payload.name {
        if name.trim().is_empty() {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::error("Name cannot be empty")),
            );
        }
    }

    // Get current asset to validate type/ticker combination
    let current = match db::assets::find_by_id(&state.pool, &id, &user.id).await {
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

    let new_type = payload.asset_type.unwrap_or(current.asset_type);
    // Merge the new ticker: if payload.ticker is Some, use it; otherwise use current
    let new_ticker: Option<String> = match &payload.ticker {
        Some(t) => Some(t.clone()),
        None => current.ticker.clone(),
    };

    // Validate ticker requirements for the new type
    match new_type {
        AssetType::Etf | AssetType::Mf | AssetType::Shares => {
            let ticker = match &new_ticker {
                Some(t) if !t.is_empty() => t.as_str(),
                _ => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(ApiResponse::error(format!(
                            "Ticker is required for asset type {:?}",
                            new_type
                        ))),
                    );
                }
            };

            // Validate ticker if it changed
            if new_ticker != current.ticker || payload.asset_type.is_some() {
                match price_fetcher::validate_ticker(new_type, ticker).await {
                    Ok(true) => {}
                    Ok(false) => {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(ApiResponse::error(format!(
                                "Invalid ticker for {:?}: {}",
                                new_type, ticker
                            ))),
                        );
                    }
                    Err(e) => {
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(ApiResponse::error(format!("Failed to validate ticker: {}", e))),
                        );
                    }
                }
            }
        }
        _ => {
            if new_ticker.is_some() {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ApiResponse::error(format!(
                        "Ticker cannot be set for asset type {:?}",
                        new_type
                    ))),
                );
            }
        }
    }

    // Validate parent if provided
    if let Some(ref parent_id) = payload.parent_id {
        if parent_id == &id {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::error("Asset cannot be its own parent")),
            );
        }
        if !db::assets::exists(&state.pool, parent_id, &user.id).await.unwrap_or(false) {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::error("Invalid parent asset")),
            );
        }
        // TODO: Check for cycles in parent chain
    }

    match db::assets::update(
        &state.pool,
        &id,
        &user.id,
        payload.name.as_deref(),
        payload.asset_type,
        payload.ticker.as_ref().map(|t| Some(t.as_str())),
        payload.parent_id.as_ref().map(|p| Some(p.as_str())),
    ).await {
        Ok(asset) => (
            StatusCode::OK,
            Json(ApiResponse::success(asset, "Asset updated")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to update asset: {}", e))),
        ),
    }
}

/// Delete an asset
pub async fn delete_asset(
    State(state): State<AppState>,
    cookies: Cookies,
    Path(id): Path<String>,
) -> (StatusCode, Json<ApiResponse<()>>) {
    let user = match get_user_from_cookie(&cookies, &state.pool).await {
        Some(user) => user,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::error("Not authenticated")),
            );
        }
    };

    if id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::error("Asset ID is required")),
        );
    }

    match db::assets::delete(&state.pool, &id, &user.id).await {
        Ok(()) => (
            StatusCode::OK,
            Json(ApiResponse::success((), "Asset deleted")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to delete asset: {}", e))),
        ),
    }
}
