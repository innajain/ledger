//! Account API handlers

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
    Account, CreateAccountRequest, UpdateAccountRequest, ApiResponse,
};

/// List all accounts for the current user
pub async fn list_accounts(
    State(state): State<AppState>,
    cookies: Cookies,
) -> (StatusCode, Json<ApiResponse<Vec<Account>>>) {
    let user = match get_user_from_cookie(&cookies, &state.pool).await {
        Some(user) => user,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::error("Not authenticated")),
            );
        }
    };

    match db::accounts::list_by_user(&state.pool, &user.id).await {
        Ok(accounts) => (
            StatusCode::OK,
            Json(ApiResponse::success(accounts, "Accounts retrieved")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to list accounts: {}", e))),
        ),
    }
}

/// Get a single account by ID
pub async fn get_account(
    State(state): State<AppState>,
    cookies: Cookies,
    Path(id): Path<String>,
) -> (StatusCode, Json<ApiResponse<Account>>) {
    let user = match get_user_from_cookie(&cookies, &state.pool).await {
        Some(user) => user,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::error("Not authenticated")),
            );
        }
    };

    match db::accounts::find_by_id(&state.pool, &id, &user.id).await {
        Ok(Some(account)) => (
            StatusCode::OK,
            Json(ApiResponse::success(account, "Account retrieved")),
        ),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::error("Account not found")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to get account: {}", e))),
        ),
    }
}

/// Create a new account
pub async fn create_account(
    State(state): State<AppState>,
    cookies: Cookies,
    Json(payload): Json<CreateAccountRequest>,
) -> (StatusCode, Json<ApiResponse<Account>>) {
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

    // Validate parent if provided
    if let Some(ref parent_id) = payload.parent_id {
        if !db::accounts::exists(&state.pool, parent_id, &user.id).await.unwrap_or(false) {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::error("Invalid parent account")),
            );
        }
    }

    let id = cuid2::create_id();
    match db::accounts::create(
        &state.pool,
        &id,
        &user.id,
        name,
        payload.account_type,
        payload.parent_id.as_deref(),
    ).await {
        Ok(account) => (
            StatusCode::CREATED,
            Json(ApiResponse::success(account, "Account created")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to create account: {}", e))),
        ),
    }
}

/// Update an account
pub async fn update_account(
    State(state): State<AppState>,
    cookies: Cookies,
    Path(id): Path<String>,
    Json(payload): Json<UpdateAccountRequest>,
) -> (StatusCode, Json<ApiResponse<Account>>) {
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
            Json(ApiResponse::error("Account ID is required")),
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

    // Validate parent if provided
    if let Some(ref parent_id) = payload.parent_id {
        if parent_id == &id {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::error("Account cannot be its own parent")),
            );
        }
        if !db::accounts::exists(&state.pool, parent_id, &user.id).await.unwrap_or(false) {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::error("Invalid parent account")),
            );
        }
        // TODO: Check for cycles in parent chain
    }

    match db::accounts::update(
        &state.pool,
        &id,
        &user.id,
        payload.name.as_deref(),
        payload.account_type,
        payload.parent_id.as_ref().map(|p| Some(p.as_str())),
    ).await {
        Ok(account) => (
            StatusCode::OK,
            Json(ApiResponse::success(account, "Account updated")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to update account: {}", e))),
        ),
    }
}

/// Delete an account
pub async fn delete_account(
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
            Json(ApiResponse::error("Account ID is required")),
        );
    }

    match db::accounts::delete(&state.pool, &id, &user.id).await {
        Ok(()) => (
            StatusCode::OK,
            Json(ApiResponse::success((), "Account deleted")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to delete account: {}", e))),
        ),
    }
}
