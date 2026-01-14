# 📒 Ledger - Personal Finance Management System (Rust Edition)

A modern, full-stack personal finance management application **built entirely in Rust**, designed to help you track accounts, assets, transactions, and allocations with precision and ease.

[![Rust](https://img.shields.io/badge/Rust-1.75+-orange?style=flat&logo=rust)](https://www.rust-lang.org/)
[![Axum](https://img.shields.io/badge/Axum-0.8-blue?style=flat)](https://github.com/tokio-rs/axum)
[![SQLx](https://img.shields.io/badge/SQLx-0.8-green?style=flat)](https://github.com/launchbadge/sqlx)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-316192?style=flat&logo=postgresql)](https://www.postgresql.org/)

## 🦀 Why Rust?

This project has been migrated from TypeScript/Next.js to Rust for:

- **Performance**: Native compiled code with zero-cost abstractions
- **Memory Safety**: Guaranteed memory safety without garbage collection
- **Reliability**: Strong type system catches errors at compile time
- **Concurrency**: Fearless concurrency with async/await

## ✨ Features

### 💰 Account Management
- **Hierarchical Account Structure** - Create and organize accounts with parent-child relationships
- **Multiple Account Types** - Support for real, nominal, and allocation accounts
- **Account Analytics** - Track balances and transactions across all accounts

### 📈 Asset Tracking
- **Multi-Asset Support** - Track various asset types:
  - 💵 Cash (Rupees)
  - 📊 Mutual Funds (MF)
  - 📈 Exchange-Traded Funds (ETF)
  - 🏢 Shares
  - 🔧 Other custom assets
- **Real-time Price Fetching** - Automatic price updates for market instruments
- **Hierarchical Asset Organization** - Group related assets for better organization

### 💸 Transaction Management
- **Double-Entry Bookkeeping** - Maintain accurate financial records with line-item based transactions
- **Detailed Transaction History** - Track every financial movement with timestamps and descriptions
- **Transaction Validation** - Automatic validation of double-entry invariants

### 📊 Allocations & Reporting
- **Portfolio Allocation** - Visualize and manage asset allocation across different categories
- **Real-time Valuations** - See current values based on live market prices

### 🔐 Security & Authentication
- **Secure Authentication** - JWT-based authentication with bcrypt password hashing
- **User Isolation** - Complete data separation between users
- **Session Management** - Cookie-based secure session handling

### 🎨 User Experience
- **Dark Mode Support** - Eye-friendly theme switching
- **Responsive Design** - Works seamlessly on desktop and mobile devices
- **Modern UI** - Built with Tailwind CSS for a clean, modern interface

## 🛠️ Technology Stack

### Backend
- **[Axum](https://github.com/tokio-rs/axum)** - Ergonomic and modular web framework
- **[Tokio](https://tokio.rs/)** - Asynchronous runtime for Rust
- **[SQLx](https://github.com/launchbadge/sqlx)** - Async SQL toolkit with compile-time query verification
- **[PostgreSQL](https://www.postgresql.org/)** - Primary database

### Frontend
- **Vanilla JavaScript** - Simple, fast, and no build step required
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework (via CDN)
- **Server Actions Pattern** - Next.js-like abstraction for seamless backend calls

### Additional Libraries
- **[jsonwebtoken](https://docs.rs/jsonwebtoken)** - JWT token handling
- **[bcrypt](https://docs.rs/bcrypt)** - Password hashing
- **[reqwest](https://docs.rs/reqwest)** - HTTP client for price fetching
- **[serde](https://serde.rs/)** - Serialization framework

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
- **Rust** 1.75 or higher (with Cargo)
- **PostgreSQL** 14.x or higher
- **Redis** (optional, for caching)

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/innajain/ledger.git
cd ledger/rust-ledger
```

### 2. Environment Setup

Create a `.env` file in the `rust-ledger` directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/ledger"

# Redis (optional)
REDIS_URL="redis://localhost:6379"

# Authentication
JWT_SECRET="your-secure-jwt-secret-key"

# Logging
RUST_LOG="ledger=debug,tower_http=debug"
```

### 3. Database Setup

```bash
# The application will automatically run migrations on startup
# Or you can run them manually with sqlx-cli:
cargo install sqlx-cli
sqlx migrate run
```

### 4. Build and Run

```bash
# Development mode
cargo run

# Production build
cargo build --release
./target/release/ledger
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🏗️ Project Structure

```
rust-ledger/
├── src/
│   ├── main.rs              # Application entry point
│   ├── api/                  # HTTP handlers
│   │   ├── mod.rs           # Router and app state
│   │   ├── auth.rs          # Authentication endpoints
│   │   ├── accounts.rs      # Account CRUD
│   │   ├── assets.rs        # Asset CRUD
│   │   ├── transactions.rs  # Transaction CRUD
│   │   ├── allocations.rs   # Portfolio allocations
│   │   ├── prices.rs        # Price fetching
│   │   └── static_files.rs  # Frontend serving
│   ├── db/                   # Database layer
│   │   ├── mod.rs           # Connection pool
│   │   ├── users.rs         # User queries
│   │   ├── accounts.rs      # Account queries
│   │   ├── assets.rs        # Asset queries
│   │   └── transactions.rs  # Transaction queries
│   ├── models/               # Domain models
│   │   └── mod.rs           # All data structures
│   ├── auth/                 # Authentication utilities
│   │   └── mod.rs           # JWT and password handling
│   └── services/             # Business logic
│       ├── mod.rs
│       ├── price_fetcher.rs # External API integration
│       └── transaction_validator.rs
├── frontend/
│   └── index.html           # Single-page frontend
├── migrations/               # SQL migrations
│   └── 20240101000000_initial.sql
├── Cargo.toml               # Dependencies
└── README.md                # This file
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/signup` - Create new user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/password` - Change password
- `PUT /api/auth/username` - Change username

### Accounts
- `GET /api/accounts` - List all accounts
- `GET /api/accounts/:id` - Get single account
- `POST /api/accounts` - Create account
- `PUT /api/accounts/:id` - Update account
- `DELETE /api/accounts/:id` - Delete account

### Assets
- `GET /api/assets` - List all assets
- `GET /api/assets/:id` - Get single asset
- `POST /api/assets` - Create asset
- `PUT /api/assets/:id` - Update asset
- `DELETE /api/assets/:id` - Delete asset

### Transactions
- `GET /api/transactions` - List transactions
- `GET /api/transactions/:id` - Get transaction details
- `POST /api/transactions` - Create transaction
- `PUT /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction

### Other
- `GET /api/allocations` - Get portfolio allocations
- `GET /api/prices/asset/:id` - Get current price for asset

## 🎯 Server Actions (Next.js-like Pattern)

The frontend uses a **Server Actions** pattern similar to Next.js, where HTTP calls are abstracted away. Instead of making raw fetch requests, you call functions that look like direct backend calls:

```javascript
// ❌ Old way - explicit HTTP calls
const result = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
});

// ✅ New way - Server Actions (looks like a function call!)
const result = await serverActions.auth.login({ username, password });
```

### Available Server Actions

```javascript
// Authentication
serverActions.auth.login({ username, password })
serverActions.auth.signup({ username, password })
serverActions.auth.logout()
serverActions.auth.getCurrentUser()
serverActions.auth.changePassword({ current_password, new_password })
serverActions.auth.changeUsername({ new_username, password })

// Accounts
serverActions.accounts.list()
serverActions.accounts.get(id)
serverActions.accounts.create({ name, account_type, parent_id })
serverActions.accounts.update(id, { name, account_type, parent_id })
serverActions.accounts.delete(id)

// Assets
serverActions.assets.list()
serverActions.assets.get(id)
serverActions.assets.create({ name, asset_type, ticker, parent_id })
serverActions.assets.update(id, { name, asset_type, ticker, parent_id })
serverActions.assets.delete(id)

// Transactions
serverActions.transactions.list()
serverActions.transactions.get(id)
serverActions.transactions.create({ datetime, description, line_items })
serverActions.transactions.update(id, { datetime, description, line_items })
serverActions.transactions.delete(id)

// Allocations & Prices
serverActions.allocations.list()
serverActions.prices.getForAsset(id)
```

### Benefits

- **Cleaner Code** - No boilerplate for HTTP requests
- **Type-like Safety** - Named functions prevent typos in URLs
- **Centralized Configuration** - All API routes defined in one place
- **Next.js Familiarity** - Similar pattern to Next.js Server Actions

## 🔒 Security Features

- **Password Hashing** - Bcrypt with salt rounds for secure password storage
- **JWT Authentication** - Secure token-based authentication with 7-day expiry
- **HTTP-only Cookies** - Protection against XSS attacks
- **User Data Isolation** - Complete separation of user data
- **Transaction Validation** - Double-entry bookkeeping invariant enforcement

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is private and proprietary. All rights reserved.

---

**Made with ❤️ and 🦀 Rust for personal finance management**
