# 📒 Ledger — Triple-Entry Personal Finance System

A sophisticated personal finance management application built with Next.js, implementing a unique **Triple-Entry Bookkeeping** system that enforces mathematical invariants to guarantee data integrity across every transaction.

[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.4.1-2D3748?style=flat&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-316192?style=flat&logo=postgresql)](https://www.postgresql.org/)

---

## 🎯 The Philosophy: Triple-Entry Bookkeeping

Traditional double-entry bookkeeping tracks _where money came from_ and _where it went_. This system goes further — every transaction must balance across **three dimensions**:

| Account Type   | Purpose                           | Examples                                  |
| -------------- | --------------------------------- | ----------------------------------------- |
| **Real**       | Where money physically exists     | Bank Account, Wallet, Google Pay, BHIM    |
| **Nominal**    | Classification of the transaction | Expenses, Income, Salary, Investments     |
| **Allocation** | Budget/allocation category        | Office Food, Commute, Discretionary, Rent |

This triple-entry approach answers three questions simultaneously:

1. **Where is the money?** (Real)
2. **What type of transaction is it?** (Nominal)
3. **Which budget category does it affect?** (Allocation)

---

## 🔒 Transaction Invariants & Storage Model

### The Null-Remainder Storage Model

Line items are stored in a **compressed format**: instead of repeating the same value across all three account types, the system stores only the Real entries (which determine totals) plus any explicit splits on the Allocation/Nominal side. The balancing entry in each group is stored as `null` and **computed at read time** by `normalize_txn`.

**Rules enforced on every save:**

| Side                              | `quantity` rule                                                 | `book_value` rule (non-rupees only)   |
| --------------------------------- | --------------------------------------------------------------- | ------------------------------------- |
| **Real**                          | Must always be provided (never `null`)                          | Must always be provided               |
| **Allocation**                    | Exactly **one** item may be `null` (the auto-derived remainder) | Exactly one item may be `null`        |
| **Nominal**                       | Exactly **one** item may be `null` (the auto-derived remainder) | Exactly one item may be `null`        |
| **No Allocation _or_ No Nominal** | Real quantities must sum to **zero**                            | Real book values must sum to **zero** |

At read time, `normalize_txn` fills every `null` with:

```
null_qty = ∑ qty(Real) − ∑ non-null qty(same account type)
```

This means the classic invariant is always satisfied after normalization:

```
∑ quantity(Real) = ∑ quantity(Allocation) = ∑ quantity(Nominal)
```

### Book Value Rules

| Asset Type                              | `book_value` in Real items             | `book_value` in Allocation/Nominal          |
| --------------------------------------- | -------------------------------------- | ------------------------------------------- |
| **Rupees**                              | Must be `null` (quantity IS the value) | Must be `null`                              |
| **Non-rupees (MF, ETF, Shares, Other)** | Must be provided — tracks cost basis   | Exactly one `null` per group (auto-derived) |

This separation allows tracking of cost basis vs market value for investment assets.

---

## 💡 Transaction Examples

### Example 1: Simple Expense (₹35 for lunch)

The allocation and nominal entries each have **one** `null` quantity — the system derives it as `∑ Real qty − 0 = −35`.

```json
{
  "description": "Lunch at office cafeteria",
  "line_items": [
    { "account": "Google Pay", "type": "real", "asset": "Money", "quantity": -35 },
    { "account": "Expenses", "type": "nominal", "asset": "Money", "quantity": null },
    { "account": "Office Food", "type": "allocation", "asset": "Money", "quantity": null }
  ]
}
```

**After normalization:** Real (−35) = Allocation (−35) = Nominal (−35) ✅

### Example 2: Buying Mutual Fund Units (₹10,000)

The `null` entries in Allocation and Nominal are each auto-derived from the Real totals.

```json
{
  "description": "SIP in Axis Bluechip Fund",
  "line_items": [
    { "account": "Bank HDFC", "type": "real", "asset": "Money", "quantity": -10000 },
    { "account": "Investments", "type": "nominal", "asset": "Money", "quantity": null },
    { "account": "Equity MF", "type": "allocation", "asset": "Money", "quantity": null },
    { "account": "Demat", "type": "real", "asset": "Axis Bluechip", "quantity": 50.25, "book_value": 10000 },
    { "account": "Investments", "type": "nominal", "asset": "Axis Bluechip", "quantity": null, "book_value": null },
    { "account": "Equity MF", "type": "allocation", "asset": "Axis Bluechip", "quantity": null, "book_value": null }
  ]
}
```

**After normalization — Money:** Real (−10000) = Allocation (−10000) = Nominal (−10000) ✅
**After normalization — Axis Bluechip qty:** 50.25 = 50.25 = 50.25 ✅
**After normalization — Axis Bluechip book value:** 10000 = 10000 = 10000 ✅

### Example 3: Transfer Between Real Accounts

```json
{
  "description": "Transfer from bank to wallet",
  "line_items": [
    { "account": "Bank HDFC", "type": "real", "asset": "Money", "quantity": -5000 },
    { "account": "Cash Wallet", "type": "real", "asset": "Money", "quantity": +5000 }
  ]
}
```

**Note:** When there are no Allocation or Nominal entries the Real quantities must sum to **zero** — the transfer's ±5000 cancel out, satisfying the constraint.

---

## ✨ Features

### 💰 Hierarchical Account Management

- **Parent-Child Relationships** — Organize accounts in a tree structure
- **Cycle Detection** — Prevents circular parent references
- **Three Account Types** — Real, Nominal, and Allocation with distinct purposes

### 📈 Multi-Asset Portfolio Tracking

| Asset Type        | Ticker Required | Price Source       |
| ----------------- | --------------- | ------------------ |
| Rupees            | No              | Fixed at 1         |
| Mutual Funds (MF) | Yes             | AMFI India NAV API |
| ETFs              | Yes             | Yahoo Finance      |
| Shares            | Yes             | Yahoo Finance      |
| Other             | No              | Manual/None        |

- **Automatic Price Fetching** — Real-time NAV and stock prices with 2-day Redis caching
- **Cost Basis Tracking** — Separate quantity (units) from book_value (cost)

### 🛡️ Data Integrity Tools

- **Integrity Checker** — `validate_all_txns` server action checks every stored transaction against all invariants; results are surfaced directly in the dashboard
- **Balance Cache** — `get_or_compute_balances` aggregates all account/asset balances via `normalize_txn` and caches results in Redis; automatically invalidated on every write
- **Atomic Transactions** — All validation happens within Prisma database transactions

### 📊 Portfolio Visualization

- **Real-time Valuations** — Current market value using live prices
- **Allocation Views** — See how your portfolio is distributed
- **Income/Expense Tracking** — Detailed cash flow analysis

### 🔐 Security

- **JWT Authentication** — Secure token-based auth with HTTP-only cookies
- **Bcrypt Password Hashing** — Industry-standard password security
- **User Isolation** — Complete data separation between users

### 🎨 Modern UX

- **Dark Mode** — System-aware theme switching
- **Responsive Design** — Mobile-first approach
- **React 19 + Next.js 16.1** — Latest React features with App Router

---

## 🛠️ Technology Stack

| Layer           | Technology                   |
| --------------- | ---------------------------- |
| **Framework**   | Next.js 16.1 (App Router)    |
| **Language**    | TypeScript 5                 |
| **UI**          | React 19, Tailwind CSS 4     |
| **ORM**         | Prisma 7.4                   |
| **Database**    | PostgreSQL (Neon Serverless) |
| **Cache**       | Redis (ioredis)              |
| **Market Data** | Yahoo Finance, AMFI India    |
| **Auth**        | JWT + bcrypt                 |

---

## 📋 Prerequisites

- **Node.js** 20.x+
- **pnpm** 10.25.0+
- **PostgreSQL** 14.x+
- **Redis** (optional, for caching)

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/innajain/ledger.git
cd ledger
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Environment Setup

Create a `.env` file in the root directory with the following variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/ledger"

# Redis (optional, for balance caching)
REDIS_URL="redis://localhost:6379"

# Authentication
JWT_SECRET="your-secure-jwt-secret-key"

# Node Environment
NODE_ENV="development"
```

### 4. Database Setup

```bash
# Generate Prisma Client
pnpm prisma generate

# Run database migrations
pnpm prisma migrate dev

# Seed the database (optional, for demo data)
pnpm tsx seed.ts
```

### 5. Start Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## 🏗️ Project Structure

```
ledger/
├── app/
│   ├── _actions/            # Server Actions (transaction logic, invariant enforcement)
│   │   ├── transactions.ts        # Core transaction creation with invariant validation
│   │   ├── transactions_update.ts # Transaction updates (same validation)
│   │   ├── validate_all_txns.ts   # Bulk invariant validation across all transactions
│   │   ├── compute_balances.ts    # Balance aggregation via normalize_txn + Redis cache
│   │   ├── flush.ts               # Redis cache flush
│   │   ├── resources.ts           # Account/Asset CRUD with hierarchy
│   │   └── auth.ts                # JWT authentication
│   ├── _components/         # Reusable React components
│   ├── _utils/              # Utilities (price fetching, date handling)
│   │   ├── normalize_txn.ts       # Fills null quantities/book values at read time
│   │   ├── validate_line_items.ts # Invariant checks + line item helpers
│   │   └── price_fetcher.ts       # Yahoo Finance / AMFI price fetching
│   ├── accounts/            # Account management
│   ├── allocations/         # Portfolio allocation views
│   ├── assets/              # Asset management
│   ├── income_expenses/     # Income/Expense tracking
│   ├── transactions/        # Transaction management
│   └── settings/            # User settings
├── prisma/
│   └── schema.prisma        # Database schema with enums
├── lib/
│   ├── prisma.ts            # Prisma client singleton
│   └── redis.ts             # Redis client singleton
└── generated/prisma/        # Generated Prisma client
```

### Frontend Architecture: Server-Wrapper Pattern

Every route follows a consistent two-file architecture that eliminates decision fatigue around client vs server components:

```
app/accounts/
├── page.tsx           # Server Component (data fetcher)
└── ClientPage.tsx     # Client Component (UI + interactivity)
```

**How it works:**

```tsx
// page.tsx — Server Component
import ClientPage from './ClientPage'
import { get_accounts } from '@/app/_actions/resources'

export default async function Page() {
  const accounts = await get_accounts() // Server-side data fetch
  return <ClientPage accounts={accounts} />
}
```

```tsx
// ClientPage.tsx — Client Component
'use client'

export default function ClientPage({ accounts }) {
  // All HTML, state, effects, and interactivity live here
  return <div>...</div>
}
```

**Why this pattern?**

| Benefit                     | Explanation                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **No micro-optimization**   | Stop debating "should this be client or server?" — everything is client-side with server-fetched initial data |
| **Consistent mental model** | Every route works the same way: fetch in `page.tsx`, render in `ClientPage.tsx`                               |
| **Full interactivity**      | No restrictions on hooks, effects, or browser APIs — it's all client code                                     |
| **Fast initial load**       | Data is fetched server-side before hydration, avoiding loading spinners                                       |
| **Type safety**             | Props are explicitly passed, making data dependencies clear                                                   |

## 🔧 Available Scripts

```bash
pnpm dev              # Start development server
pnpm build            # Build for production
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm analyze          # Analyze bundle size

# Database
pnpm prisma generate    # Generate Prisma Client
pnpm prisma migrate dev # Run migrations
pnpm prisma studio      # Open Prisma Studio
```

## 📊 Database Schema

```prisma
model line_item {
  quantity   Decimal? @db.Decimal(14, 4)   // Units; null in Allocation/Nominal means auto-derived
  book_value Decimal? @db.Decimal(14, 4)   // Cost basis; null for Rupees or auto-derived entries

  description String?   // Optional per-line-item override
  datetime    DateTime? // Optional per-line-item datetime override

  account     account     // Links to Real, Nominal, or Allocation account
  asset       asset       // Links to Rupees, MF, ETF, Shares, or Other
  transaction transaction
}

enum account_type { real, nominal, allocation }
enum asset_type { rupees, mf, etf, shares, other }
```

**Key Features:**

- `quantity` and `book_value` are nullable — the null-remainder pattern stores only Real entries plus any explicit splits; `normalize_txn` derives the rest at read time
- Decimal(14,4) precision for financial accuracy
- Hierarchical accounts/assets with cycle detection
- Cascade deletion for referential integrity
- Optimized indexes on `user_id`, `datetime`, and foreign keys

---

## 🔍 Integrity Checker

The `validate_all_txns` server action loads every transaction from the database, runs it through `validate_line_items`, and returns a list of any transactions that violate the invariants. It is accessible as a button on the main dashboard.

**Checks performed:**

1. ✅ Real account line items never have `null` quantity
2. ✅ Allocation/Nominal groups each have exactly one `null` quantity placeholder
3. ✅ Book value rules are respected per asset type
4. ✅ Real-only transactions (transfers) have quantities summing to zero

---

## 🔒 Security

| Feature            | Implementation                      |
| ------------------ | ----------------------------------- |
| Password Storage   | bcrypt with configurable rounds     |
| Session Management | JWT in HTTP-only cookies            |
| User Isolation     | All queries scoped to user_id       |
| Data Integrity     | Transaction-level atomic operations |

---

## 📝 License

This project is private and proprietary. All rights reserved.

---

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) — React Framework
- [Prisma](https://www.prisma.io/) — Type-safe ORM
- [Tailwind CSS](https://tailwindcss.com/) — Styling
- [Yahoo Finance](https://finance.yahoo.com/) — Market data
- [AMFI India](https://www.amfiindia.com/) — Mutual fund NAVs

---

<p align="center">
  <strong>Built for financial accuracy. Enforced by mathematics.</strong>
</p>
