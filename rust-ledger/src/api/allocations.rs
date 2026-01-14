//! Allocations API handlers

use axum::{
    Json,
    extract::State,
    http::StatusCode,
};
use rust_decimal::Decimal;
use sqlx::Row;
use tower_cookies::Cookies;
use crate::api::AppState;
use crate::api::auth::get_user_from_cookie;
use crate::db;
use crate::models::{
    AccountType, AssetType, AllocationSummary, ApiResponse,
};
use crate::services::price_fetcher;

/// List all allocations with current values
pub async fn list_allocations(
    State(state): State<AppState>,
    cookies: Cookies,
) -> (StatusCode, Json<ApiResponse<Vec<AllocationSummary>>>) {
    let user = match get_user_from_cookie(&cookies, &state.pool).await {
        Some(user) => user,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::error("Not authenticated")),
            );
        }
    };

    // Get all allocation accounts
    let accounts = match db::accounts::list_by_type(&state.pool, &user.id, AccountType::Allocation).await {
        Ok(a) => a,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::error(format!("Failed to list allocations: {}", e))),
            );
        }
    };

    let mut allocations = Vec::new();

    for account in accounts {
        // Get line items for this account
        let rows = match sqlx::query(
            r#"SELECT li.quantity, li.book_value, a.type as asset_type, a.ticker
               FROM line_item li
               JOIN asset a ON li.asset_id = a.id
               WHERE li.account_id = $1"#
        )
        .bind(&account.id)
        .fetch_all(&state.pool)
        .await {
            Ok(items) => items,
            Err(e) => {
                tracing::error!("Failed to get line items for account {}: {}", account.id, e);
                continue;
            }
        };

        let mut total = Decimal::ZERO;

        for row in rows {
            let qty: Decimal = row.try_get("quantity").unwrap_or_default();
            let book_value: Option<Decimal> = row.try_get("book_value").ok();
            let asset_type: AssetType = row.try_get("asset_type").unwrap_or(AssetType::Other);
            let ticker: Option<String> = row.try_get("ticker").ok();
            
            let current_value = match asset_type {
                AssetType::Rupees => qty,
                AssetType::Mf | AssetType::Etf | AssetType::Shares => {
                    if let Some(ref t) = ticker {
                        match price_fetcher::get_price_for_asset(asset_type, Some(t)).await {
                            Ok(Some(price_data)) => price_data.price * qty,
                            _ => book_value.unwrap_or(qty),
                        }
                    } else {
                        book_value.unwrap_or(qty)
                    }
                }
                AssetType::Other => book_value.unwrap_or(qty),
            };

            total += current_value;
        }

        allocations.push(AllocationSummary {
            id: account.id,
            name: account.name,
            total,
        });
    }

    (
        StatusCode::OK,
        Json(ApiResponse::success(allocations, "Allocations retrieved")),
    )
}
