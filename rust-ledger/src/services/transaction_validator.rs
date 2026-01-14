//! Transaction validation for double-entry bookkeeping

use anyhow::{Result, anyhow};
use rust_decimal::Decimal;
use std::collections::HashMap;
use crate::models::{Account, Asset, AccountType, AssetType, CreateLineItemInput};

/// Validate that a transaction maintains double-entry bookkeeping invariants
pub fn validate_transaction(
    line_items: &[CreateLineItemInput],
    accounts: &HashMap<String, &Account>,
    assets: &HashMap<String, &Asset>,
) -> Result<()> {
    if line_items.is_empty() {
        return Err(anyhow!("At least one line item is required"));
    }

    // Check for zero quantities
    for li in line_items {
        if li.quantity.is_zero() {
            return Err(anyhow!("Quantity cannot be zero in any line item"));
        }
    }

    // Validate book_value requirements
    for li in line_items {
        let asset = assets.get(&li.asset_id)
            .ok_or_else(|| anyhow!("Asset not found: {}", li.asset_id))?;
        
        match asset.asset_type {
            AssetType::Rupees => {
                // For rupees, book_value must be None
                if li.book_value.is_some() {
                    return Err(anyhow!(
                        "Book value must not be specified for currency asset \"{}\" (quantity is the value)",
                        asset.name
                    ));
                }
            }
            _ => {
                // For non-rupees, book_value is required
                if li.book_value.is_none() {
                    return Err(anyhow!(
                        "Book value is required for non-currency asset \"{}\"",
                        asset.name
                    ));
                }
            }
        }
    }

    // Track quantities by asset and account type
    let mut qty_by_asset_real: HashMap<String, Decimal> = HashMap::new();
    let mut qty_by_asset_alloc: HashMap<String, Decimal> = HashMap::new();
    let mut qty_by_asset_nominal: HashMap<String, Decimal> = HashMap::new();

    // Track values by account type
    let mut sum_value_real = Decimal::ZERO;
    let mut sum_value_alloc = Decimal::ZERO;
    let mut sum_value_nominal = Decimal::ZERO;

    for li in line_items {
        let account = accounts.get(&li.account_id)
            .ok_or_else(|| anyhow!("Account not found: {}", li.account_id))?;
        
        let qty = li.quantity;
        let val = li.book_value.unwrap_or(li.quantity);

        // Accumulate quantity by asset & account type
        match account.account_type {
            AccountType::Real => {
                *qty_by_asset_real.entry(li.asset_id.clone()).or_default() += qty;
                sum_value_real += val;
            }
            AccountType::Allocation => {
                *qty_by_asset_alloc.entry(li.asset_id.clone()).or_default() += qty;
                sum_value_alloc += val;
            }
            AccountType::Nominal => {
                *qty_by_asset_nominal.entry(li.asset_id.clone()).or_default() += qty;
                sum_value_nominal += val;
            }
        }
    }

    // Collect all asset IDs
    let mut all_asset_ids: Vec<String> = qty_by_asset_real.keys()
        .chain(qty_by_asset_alloc.keys())
        .chain(qty_by_asset_nominal.keys())
        .cloned()
        .collect();
    all_asset_ids.sort();
    all_asset_ids.dedup();

    // Check invariant 1: per-asset quantities equal between real, allocation, and nominal
    for asset_id in &all_asset_ids {
        let real_qty = qty_by_asset_real.get(asset_id).copied().unwrap_or_default();
        let alloc_qty = qty_by_asset_alloc.get(asset_id).copied().unwrap_or_default();
        let nominal_qty = qty_by_asset_nominal.get(asset_id).copied().unwrap_or_default();

        if real_qty != alloc_qty || real_qty != nominal_qty {
            let asset = assets.get(asset_id)
                .ok_or_else(|| anyhow!("Asset not found: {}", asset_id))?;
            
            return Err(anyhow!(
                "Transaction is not balanced for asset \"{}\": Real accounts total {}, Allocation accounts total {}, Nominal accounts total {}. All three must be equal.",
                asset.name,
                real_qty,
                alloc_qty,
                nominal_qty
            ));
        }
    }

    // Check invariant 2: sum(value) in real == nominal == allocation
    if sum_value_real != sum_value_nominal || sum_value_real != sum_value_alloc {
        return Err(anyhow!(
            "Transaction is not balanced by value: Real accounts total {}, Allocation accounts total {}, Nominal accounts total {}. All three must be equal.",
            sum_value_real,
            sum_value_alloc,
            sum_value_nominal
        ));
    }

    Ok(())
}
