//! Authentication utilities

use anyhow::{Result, anyhow};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use serde::{Deserialize, Serialize};

const JWT_EXPIRY_DAYS: i64 = 7;

/// JWT claims
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub uid: String,
    pub exp: i64,
    pub iat: i64,
}

/// Get JWT secret from environment
fn get_secret() -> Result<String> {
    std::env::var("JWT_SECRET")
        .map_err(|_| anyhow!("JWT_SECRET environment variable not set"))
}

/// Hash a password using bcrypt
pub fn hash_password(password: &str) -> Result<String> {
    hash(password, DEFAULT_COST)
        .map_err(|e| anyhow!("Failed to hash password: {}", e))
}

/// Verify a password against a hash
pub fn verify_password(password: &str, hash: &str) -> Result<bool> {
    verify(password, hash)
        .map_err(|e| anyhow!("Failed to verify password: {}", e))
}

/// Create a JWT token for a user
pub fn create_token(user_id: &str) -> Result<String> {
    let secret = get_secret()?;
    let now = Utc::now();
    let exp = now + Duration::days(JWT_EXPIRY_DAYS);
    
    let claims = Claims {
        uid: user_id.to_string(),
        exp: exp.timestamp(),
        iat: now.timestamp(),
    };
    
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| anyhow!("Failed to create JWT token: {}", e))
}

/// Verify and decode a JWT token
pub fn verify_token(token: &str) -> Result<Claims> {
    let secret = get_secret()?;
    
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| anyhow!("Invalid token: {}", e))?;
    
    Ok(token_data.claims)
}

/// Cookie configuration
pub const TOKEN_COOKIE_NAME: &str = "ledger_token";
pub const COOKIE_MAX_AGE_SECONDS: i64 = JWT_EXPIRY_DAYS * 24 * 60 * 60;
