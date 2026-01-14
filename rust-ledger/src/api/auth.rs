//! Authentication API handlers

use axum::{
    Json,
    extract::State,
    http::StatusCode,
};
use tower_cookies::{Cookies, Cookie};
use crate::api::AppState;
use crate::auth::{self, TOKEN_COOKIE_NAME, COOKIE_MAX_AGE_SECONDS};
use crate::db;
use crate::models::{
    AuthRequest, AuthResponse, ChangePasswordRequest, ChangeUsernameRequest,
    ApiResponse, UserPublic,
};

/// Extract current user from cookie
pub async fn get_user_from_cookie(
    cookies: &Cookies,
    pool: &sqlx::PgPool,
) -> Option<crate::models::User> {
    let cookie = cookies.get(TOKEN_COOKIE_NAME)?;
    let token = cookie.value();
    
    let claims = auth::verify_token(token).ok()?;
    db::users::find_by_id(pool, &claims.uid).await.ok()?
}

/// Sign up a new user
pub async fn sign_up(
    State(state): State<AppState>,
    cookies: Cookies,
    Json(payload): Json<AuthRequest>,
) -> (StatusCode, Json<AuthResponse>) {
    let username = payload.username.trim();
    let password = &payload.password;

    if username.is_empty() || password.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(AuthResponse {
                success: false,
                message: "Username and password required".to_string(),
                user: None,
            }),
        );
    }

    // Check if user exists
    if let Ok(Some(_)) = db::users::find_by_username(&state.pool, username).await {
        return (
            StatusCode::CONFLICT,
            Json(AuthResponse {
                success: false,
                message: "User already exists".to_string(),
                user: None,
            }),
        );
    }

    // Hash password and create user
    let password_hash = match auth::hash_password(password) {
        Ok(hash) => hash,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    message: format!("Failed to hash password: {}", e),
                    user: None,
                }),
            );
        }
    };

    let id = cuid2::create_id();
    let user = match db::users::create(&state.pool, &id, username, &password_hash).await {
        Ok(user) => user,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    message: format!("Failed to create user: {}", e),
                    user: None,
                }),
            );
        }
    };

    // Create token and set cookie
    let token = match auth::create_token(&user.id) {
        Ok(token) => token,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    message: format!("Failed to create token: {}", e),
                    user: None,
                }),
            );
        }
    };

    let mut cookie = Cookie::new(TOKEN_COOKIE_NAME, token);
    cookie.set_path("/");
    cookie.set_http_only(true);
    cookie.set_max_age(cookie::time::Duration::seconds(COOKIE_MAX_AGE_SECONDS));
    cookies.add(cookie);

    (
        StatusCode::CREATED,
        Json(AuthResponse {
            success: true,
            message: "User created successfully".to_string(),
            user: Some(UserPublic::from(user)),
        }),
    )
}

/// Log in an existing user
pub async fn log_in(
    State(state): State<AppState>,
    cookies: Cookies,
    Json(payload): Json<AuthRequest>,
) -> (StatusCode, Json<AuthResponse>) {
    let username = payload.username.trim();
    let password = &payload.password;

    if username.is_empty() || password.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(AuthResponse {
                success: false,
                message: "Username and password required".to_string(),
                user: None,
            }),
        );
    }

    // Find user
    let user = match db::users::find_by_username(&state.pool, username).await {
        Ok(Some(user)) => user,
        Ok(None) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(AuthResponse {
                    success: false,
                    message: "Invalid credentials".to_string(),
                    user: None,
                }),
            );
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    message: format!("Database error: {}", e),
                    user: None,
                }),
            );
        }
    };

    // Verify password
    match auth::verify_password(password, &user.password_hash) {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(AuthResponse {
                    success: false,
                    message: "Invalid credentials".to_string(),
                    user: None,
                }),
            );
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    message: format!("Password verification failed: {}", e),
                    user: None,
                }),
            );
        }
    }

    // Create token and set cookie
    let token = match auth::create_token(&user.id) {
        Ok(token) => token,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AuthResponse {
                    success: false,
                    message: format!("Failed to create token: {}", e),
                    user: None,
                }),
            );
        }
    };

    let mut cookie = Cookie::new(TOKEN_COOKIE_NAME, token);
    cookie.set_path("/");
    cookie.set_http_only(true);
    cookie.set_max_age(cookie::time::Duration::seconds(COOKIE_MAX_AGE_SECONDS));
    cookies.add(cookie);

    (
        StatusCode::OK,
        Json(AuthResponse {
            success: true,
            message: "Logged in successfully".to_string(),
            user: Some(UserPublic::from(user)),
        }),
    )
}

/// Log out the current user
pub async fn log_out(cookies: Cookies) -> (StatusCode, Json<ApiResponse<()>>) {
    let mut cookie = Cookie::new(TOKEN_COOKIE_NAME, "");
    cookie.set_path("/");
    cookie.set_max_age(cookie::time::Duration::seconds(0));
    cookies.remove(cookie);

    (
        StatusCode::OK,
        Json(ApiResponse::success((), "Logged out successfully")),
    )
}

/// Get current user
pub async fn get_current_user(
    State(state): State<AppState>,
    cookies: Cookies,
) -> (StatusCode, Json<ApiResponse<UserPublic>>) {
    match get_user_from_cookie(&cookies, &state.pool).await {
        Some(user) => (
            StatusCode::OK,
            Json(ApiResponse::success(UserPublic::from(user), "User retrieved")),
        ),
        None => (
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::error("Not authenticated")),
        ),
    }
}

/// Change password
pub async fn change_password(
    State(state): State<AppState>,
    cookies: Cookies,
    Json(payload): Json<ChangePasswordRequest>,
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

    if payload.current_password.is_empty() || payload.new_password.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::error("Current password and new password required")),
        );
    }

    // Verify current password
    match auth::verify_password(&payload.current_password, &user.password_hash) {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::error("Current password is incorrect")),
            );
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::error(format!("Password verification failed: {}", e))),
            );
        }
    }

    // Hash and update new password
    let new_hash = match auth::hash_password(&payload.new_password) {
        Ok(hash) => hash,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::error(format!("Failed to hash password: {}", e))),
            );
        }
    };

    if let Err(e) = db::users::update_password(&state.pool, &user.id, &new_hash).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to update password: {}", e))),
        );
    }

    (
        StatusCode::OK,
        Json(ApiResponse::success((), "Password changed successfully")),
    )
}

/// Change username
pub async fn change_username(
    State(state): State<AppState>,
    cookies: Cookies,
    Json(payload): Json<ChangeUsernameRequest>,
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

    let new_username = payload.new_username.trim();
    if new_username.is_empty() || payload.password.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::error("New username and password required")),
        );
    }

    // Verify password
    match auth::verify_password(&payload.password, &user.password_hash) {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::error("Password is incorrect")),
            );
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::error(format!("Password verification failed: {}", e))),
            );
        }
    }

    // Check if username is the same
    if user.username == new_username {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::error("New username must be different from current username")),
        );
    }

    // Check if username is taken
    if let Ok(Some(existing)) = db::users::find_by_username(&state.pool, new_username).await {
        if existing.id != user.id {
            return (
                StatusCode::CONFLICT,
                Json(ApiResponse::error("Username already taken")),
            );
        }
    }

    if let Err(e) = db::users::update_username(&state.pool, &user.id, new_username).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(format!("Failed to update username: {}", e))),
        );
    }

    (
        StatusCode::OK,
        Json(ApiResponse::success((), "Username changed successfully")),
    )
}
