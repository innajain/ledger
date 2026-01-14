//! Price fetching service for assets

use anyhow::Result;
use chrono::Utc;
use rust_decimal::Decimal;
use serde::Deserialize;
use crate::models::{AssetType, PriceData};

/// Get the current price for an asset based on its type and ticker
pub async fn get_price_for_asset(
    asset_type: AssetType,
    ticker: Option<&str>,
) -> Result<Option<PriceData>> {
    match asset_type {
        AssetType::Rupees => {
            // Currency is 1:1
            Ok(Some(PriceData {
                price: Decimal::ONE,
                date: Utc::now(),
            }))
        }
        AssetType::Mf => {
            if let Some(ticker) = ticker {
                get_nav(ticker).await
            } else {
                Ok(None)
            }
        }
        AssetType::Etf | AssetType::Shares => {
            if let Some(ticker) = ticker {
                get_latest_etf_or_shares_price(ticker).await
            } else {
                Ok(None)
            }
        }
        AssetType::Other => Ok(None),
    }
}

/// Get NAV (Net Asset Value) for mutual funds
/// Uses the AMFI API to fetch the latest NAV
pub async fn get_nav(code: &str) -> Result<Option<PriceData>> {
    let url = format!(
        "https://api.mfapi.in/mf/{}/latest",
        code
    );
    
    let client = reqwest::Client::new();
    let response = client.get(&url).send().await?;
    
    if !response.status().is_success() {
        return Ok(None);
    }
    
    #[derive(Deserialize)]
    struct MfApiResponse {
        data: Option<Vec<NavData>>,
    }
    
    #[derive(Deserialize)]
    struct NavData {
        nav: String,
        date: String,
    }
    
    let data: MfApiResponse = response.json().await?;
    
    if let Some(nav_data) = data.data.and_then(|d| d.into_iter().next()) {
        let price = match nav_data.nav.parse::<Decimal>() {
            Ok(p) => p,
            Err(_) => return Ok(None),
        };
        // Parse date in DD-MM-YYYY format
        let parts: Vec<&str> = nav_data.date.split('-').collect();
        if parts.len() == 3 {
            let date = chrono::NaiveDate::from_ymd_opt(
                parts[2].parse().unwrap_or(2024),
                parts[1].parse().unwrap_or(1),
                parts[0].parse().unwrap_or(1),
            );
            if let Some(d) = date {
                return Ok(Some(PriceData {
                    price,
                    date: d.and_hms_opt(0, 0, 0).unwrap().and_utc(),
                }));
            }
        }
        return Ok(Some(PriceData {
            price,
            date: Utc::now(),
        }));
    }
    
    Ok(None)
}

/// Get latest price for ETFs or shares using Yahoo Finance API
pub async fn get_latest_etf_or_shares_price(ticker: &str) -> Result<Option<PriceData>> {
    // Use Yahoo Finance API
    let url = format!(
        "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range=1d",
        ticker
    );
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()?;
    
    let response = client.get(&url).send().await?;
    
    if !response.status().is_success() {
        return Ok(None);
    }
    
    #[derive(Deserialize)]
    struct YahooResponse {
        chart: Option<ChartData>,
    }
    
    #[derive(Deserialize)]
    struct ChartData {
        result: Option<Vec<ChartResult>>,
    }
    
    #[derive(Deserialize)]
    struct ChartResult {
        meta: MetaData,
    }
    
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct MetaData {
        regular_market_price: Option<f64>,
    }
    
    let data: YahooResponse = response.json().await?;
    
    if let Some(chart) = data.chart {
        if let Some(results) = chart.result {
            if let Some(result) = results.into_iter().next() {
                if let Some(price) = result.meta.regular_market_price {
                    return Ok(Some(PriceData {
                        price: Decimal::try_from(price).unwrap_or(Decimal::ZERO),
                        date: Utc::now(),
                    }));
                }
            }
        }
    }
    
    Ok(None)
}

/// Validate that a ticker is valid for a given asset type
pub async fn validate_ticker(asset_type: AssetType, ticker: &str) -> Result<bool> {
    match asset_type {
        AssetType::Mf => {
            let result = get_nav(ticker).await?;
            Ok(result.is_some())
        }
        AssetType::Etf | AssetType::Shares => {
            let result = get_latest_etf_or_shares_price(ticker).await?;
            Ok(result.is_some())
        }
        _ => Ok(true),
    }
}
