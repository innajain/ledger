//! Transaction API handlers

use axum::{
    Json,
    extract::{State, Path, Query},
    http::StatusCode,
};
use serde::Deserialize;
use std::collections::HashMap;
use tower_cookies::Cookies;
use crate::api::AppState;
use crate::api::auth::get_user_from_cookie;
use crate::db;
use crate::db::transactions::LineItemInput;
use crate::models::{
    Transaction, TransactionDetail, LineItemDetail,
    CreateTransactionRequest, UpdateTransactionRequest, ApiResponse,
};
use crate::services::transaction_validator;

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    limit: Option<i64>,
    offset: Option<i64>,
}

/// List all transactions for the current user
pub async fn list_transactions(
    State(state): State<AppState>,
    cookies: Cookies,
    Query(query): Query<ListQuery>,
) -> (StatusCode, Json<ApiResponse<Vec<Transaction>>>) {
    let user = match get_user_from_cookie(&cookies, &state.pool).await {
        Some(user) => user,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::error("Not authenticated")),
            );
        }
    };

    let limit = query.limit.unwrap_or(50);
    let offset = query.offset.unwrap_or(0);

    match db::transactions::list_by_user(&state.pool, &user.id, limit, offset).await {
        Ok(transactions) => (
            StatusCode::OK,
            Json(ApiResponse::success(transactions, "Transactions retrieved")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to list transactions: {}", e))),
        ),
    }
}

/// Get a single transaction by ID with full details
pub async fn get_transaction(
    State(state): State<AppState>,
    cookies: Cookies,
    Path(id): Path<String>,
) -> (StatusCode, Json<ApiResponse<TransactionDetail>>) {
    let user = match get_user_from_cookie(&cookies, &state.pool).await {
        Some(user) => user,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::error("Not authenticated")),
            );
        }
    };

    let transaction = match db::transactions::find_by_id(&state.pool, &id, &user.id).await {
        Ok(Some(t)) => t,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(ApiResponse::error("Transaction not found")),
            );
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::error(format!("Failed to get transaction: {}", e))),
            );
        }
    };

    // Get line items
    let line_items = match db::transactions::get_line_items(&state.pool, &id).await {
        Ok(items) => items,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::error(format!("Failed to get line items: {}", e))),
            );
        }
    };

    // Get related accounts and assets
    let account_ids: Vec<String> = line_items.iter().map(|li| li.account_id.clone()).collect();
    let asset_ids: Vec<String> = line_items.iter().map(|li| li.asset_id.clone()).collect();

    let accounts = match db::transactions::get_accounts_by_ids(&state.pool, &account_ids, &user.id).await {
        Ok(a) => a,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::error(format!("Failed to get accounts: {}", e))),
            );
        }
    };

    let assets = match db::transactions::get_assets_by_ids(&state.pool, &asset_ids, &user.id).await {
        Ok(a) => a,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::error(format!("Failed to get assets: {}", e))),
            );
        }
    };

    let account_map: HashMap<String, _> = accounts.into_iter().map(|a| (a.id.clone(), a)).collect();
    let asset_map: HashMap<String, _> = assets.into_iter().map(|a| (a.id.clone(), a)).collect();

    let line_item_details: Vec<LineItemDetail> = line_items
        .into_iter()
        .filter_map(|li| {
            let account = account_map.get(&li.account_id)?.clone();
            let asset = asset_map.get(&li.asset_id)?.clone();
            Some(LineItemDetail {
                id: li.id,
                account,
                asset,
                quantity: li.quantity,
                book_value: li.book_value,
                description: li.description,
                datetime: li.datetime,
            })
        })
        .collect();

    let detail = TransactionDetail {
        id: transaction.id,
        datetime: transaction.datetime,
        description: transaction.description,
        line_items: line_item_details,
    };

    (
        StatusCode::OK,
        Json(ApiResponse::success(detail, "Transaction retrieved")),
    )
}

/// Create a new transaction
pub async fn create_transaction(
    State(state): State<AppState>,
    cookies: Cookies,
    Json(payload): Json<CreateTransactionRequest>,
) -> (StatusCode, Json<ApiResponse<Transaction>>) {
    let user = match get_user_from_cookie(&cookies, &state.pool).await {
        Some(user) => user,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::error("Not authenticated")),
            );
        }
    };

    if payload.line_items.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::error("At least one line item is required")),
        );
    }

    // Collect unique account and asset IDs
    let account_ids: Vec<String> = payload.line_items.iter().map(|li| li.account_id.clone()).collect();
    let asset_ids: Vec<String> = payload.line_items.iter().map(|li| li.asset_id.clone()).collect();

    // Fetch accounts and assets
    let accounts = match db::transactions::get_accounts_by_ids(&state.pool, &account_ids, &user.id).await {
        Ok(a) => a,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::error(format!("Failed to verify accounts: {}", e))),
            );
        }
    };

    if accounts.len() != account_ids.iter().collect::<std::collections::HashSet<_>>().len() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::error("One or more accounts not found or do not belong to you")),
        );
    }

    let assets = match db::transactions::get_assets_by_ids(&state.pool, &asset_ids, &user.id).await {
        Ok(a) => a,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::error(format!("Failed to verify assets: {}", e))),
            );
        }
    };

    if assets.len() != asset_ids.iter().collect::<std::collections::HashSet<_>>().len() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::error("One or more assets not found or do not belong to you")),
        );
    }

    // Create maps for validation
    let account_map: HashMap<String, &_> = accounts.iter().map(|a| (a.id.clone(), a)).collect();
    let asset_map: HashMap<String, &_> = assets.iter().map(|a| (a.id.clone(), a)).collect();

    // Validate transaction invariants
    if let Err(e) = transaction_validator::validate_transaction(&payload.line_items, &account_map, &asset_map) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::error(e.to_string())),
        );
    }

    // Convert line items
    let line_items: Vec<LineItemInput> = payload.line_items.into_iter().map(|li| {
        LineItemInput {
            account_id: li.account_id,
            asset_id: li.asset_id,
            quantity: li.quantity,
            book_value: li.book_value,
            description: li.description.filter(|s| !s.trim().is_empty()),
            datetime: li.datetime,
        }
    }).collect();

    let id = cuid2::create_id();
    let description = payload.description.filter(|s| !s.trim().is_empty());

    match db::transactions::create(
        &state.pool,
        &id,
        &user.id,
        payload.datetime,
        description.as_deref(),
        line_items,
    ).await {
        Ok(transaction) => (
            StatusCode::CREATED,
            Json(ApiResponse::success(transaction, "Transaction created")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to create transaction: {}", e))),
        ),
    }
}

/// Update a transaction
pub async fn update_transaction(
    State(state): State<AppState>,
    cookies: Cookies,
    Path(id): Path<String>,
    Json(payload): Json<UpdateTransactionRequest>,
) -> (StatusCode, Json<ApiResponse<Transaction>>) {
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
            Json(ApiResponse::error("Transaction ID is required")),
        );
    }

    // Validate line items if provided
    let line_items = if let Some(ref items) = payload.line_items {
        if items.is_empty() {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::error("At least one line item is required")),
            );
        }

        let account_ids: Vec<String> = items.iter().map(|li| li.account_id.clone()).collect();
        let asset_ids: Vec<String> = items.iter().map(|li| li.asset_id.clone()).collect();

        let accounts = match db::transactions::get_accounts_by_ids(&state.pool, &account_ids, &user.id).await {
            Ok(a) => a,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ApiResponse::error(format!("Failed to verify accounts: {}", e))),
                );
            }
        };

        let assets = match db::transactions::get_assets_by_ids(&state.pool, &asset_ids, &user.id).await {
            Ok(a) => a,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ApiResponse::error(format!("Failed to verify assets: {}", e))),
                );
            }
        };

        let account_map: HashMap<String, &_> = accounts.iter().map(|a| (a.id.clone(), a)).collect();
        let asset_map: HashMap<String, &_> = assets.iter().map(|a| (a.id.clone(), a)).collect();

        if let Err(e) = transaction_validator::validate_transaction(items, &account_map, &asset_map) {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::error(e.to_string())),
            );
        }

        Some(items.iter().map(|li| {
            LineItemInput {
                account_id: li.account_id.clone(),
                asset_id: li.asset_id.clone(),
                quantity: li.quantity,
                book_value: li.book_value,
                description: li.description.clone().filter(|s| !s.trim().is_empty()),
                datetime: li.datetime,
            }
        }).collect())
    } else {
        None
    };

    // Handle description: None means don't change, Some(None) means clear, Some(Some(s)) means set
    let description: Option<Option<&str>> = match &payload.description {
        None => None, // Don't change
        Some(s) if s.trim().is_empty() => Some(None), // Clear
        Some(s) => Some(Some(s.as_str())), // Set
    };

    match db::transactions::update(
        &state.pool,
        &id,
        &user.id,
        payload.datetime,
        description,
        line_items,
    ).await {
        Ok(transaction) => (
            StatusCode::OK,
            Json(ApiResponse::success(transaction, "Transaction updated")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to update transaction: {}", e))),
        ),
    }
}

/// Delete a transaction
pub async fn delete_transaction(
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
            Json(ApiResponse::error("Transaction ID is required")),
        );
    }

    match db::transactions::delete(&state.pool, &id, &user.id).await {
        Ok(()) => (
            StatusCode::OK,
            Json(ApiResponse::success((), "Transaction deleted")),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to delete transaction: {}", e))),
        ),
    }
}
