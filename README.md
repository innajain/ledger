# 📒 Ledger — Triple-Entry Personal Finance System

A sophisticated personal finance management application built with Next.js, implementing a unique **Triple-Entry Bookkeeping** system that enforces mathematical invariants to guarantee data integrity across every transaction.

[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.6-2D3748?style=flat&logo=prisma)](https://www.prisma.io/)
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

### 💰 Hierarchical Accounts & Assets

- **Parent-Child Relationships** — Organize accounts and assets into a tree structure
- **Cycle Detection** — Walks up the parent chain on every update to prevent circular references
- **Three Account Types** — Real, Nominal, and Allocation with distinct purposes
- **Soft-Delete via `is_active`** — Accounts and assets can be deactivated without losing transaction history

### 📈 Multi-Asset Portfolio Tracking

| Asset Type        | Ticker Required | Price Source                  |
| ----------------- | --------------- | ----------------------------- |
| Rupees            | No              | Fixed at 1                    |
| Mutual Funds (MF) | Yes (ISIN)      | AMFI India NAV bulk feed      |
| ETFs              | Yes             | Yahoo Finance                 |
| Shares            | Yes             | Yahoo Finance                 |
| Other             | No              | Manual / treated as cost basis |

- **Ticker validation** — Asset creation rejects invalid tickers by hitting the price source up-front
- **Cost-basis tracking** — `quantity` (units) and `book_value` (cost) are stored separately for non-rupees assets
- **Live valuation** — Per-asset and per-allocation pages price holdings using the latest cached price; falls back to book value when no price is available

### 🧾 Transaction Templates

Reusable transaction shapes for recurring entries (rent, SIPs, payday splits).

- **Create / Update / Delete** templates from the transaction-create screen
- **Quick-load** a template into a new transaction (carried via `sessionStorage`) to prefill all line items
- Stored as `transaction_template` + `line_item_template` rows; templates are user-scoped and cascade on delete

### 📊 XIRR Returns (per asset)

Each non-rupees asset detail page computes an **XIRR (extended internal rate of return)** from the cashflows implied by every line item that ever touched the asset, with the current market value as the closing flow. Powered by the [`xirr`](https://www.npmjs.com/package/xirr) package.

### 🛡️ Data Integrity Tools

- **Integrity Checker** — `validate_all_txns` server action (wired to a button on the dashboard) loads every stored transaction, runs each through `validate_line_items`, and surfaces any that violate the invariants
- **Atomic writes** — All transaction create/update flows run inside a Prisma `$transaction`, so validation and persistence are all-or-nothing
- **Balance cache** — `get_or_compute_balances` aggregates `account → asset` and `asset → account` balance maps via `normalize_txn` and caches them in Redis (5-day TTL); the cache is overwritten on every transaction write

### 🗄️ Database Dump Endpoint

`GET /api/dump` streams a `.sql` file containing `INSERT` statements for every user-data table (auth-gated; allowlists table names to avoid SQL-injection on tablename interpolation).

### 🔐 Security

- **JWT in HTTP-only cookies** — 7-day expiry, signed with `JWT_SECRET`
- **Edge proxy gate** — `proxy.ts` runs Next.js's proxy hook on every non-public route; verifies the JWT and redirects to `/login` on failure, then stamps `x-user-id` on the response
- **bcryptjs password hashing** — pure-JS implementation, 10 rounds
- **User isolation** — Every query is scoped to the authenticated `user_id`
- **Cron auth** — `/api/cron/sync-nav` requires a `Bearer ${CRON_SECRET}` header in production

### 🎨 Modern UX

- **Dark mode** — System-aware theme switching via `next-themes`
- **Server-Wrapper pattern** — Every route is a thin server component that fetches data, then hands off to a client component for all rendering and interactivity (see below)
- **React 19 + Next.js 16.1** — Latest React features with the App Router

---

## 🛠️ Technology Stack

| Layer           | Technology                         |
| --------------- | ---------------------------------- |
| **Framework**   | Next.js 16.1 (App Router)          |
| **Language**    | TypeScript 5                       |
| **UI**          | React 19, Tailwind CSS 4           |
| **ORM**         | Prisma 7.6 (`prisma-client` engine) |
| **Database**    | PostgreSQL (Neon Serverless)       |
| **Cache**       | Redis (ioredis)                    |
| **Market Data** | Yahoo Finance, AMFI India          |
| **Auth**        | JWT + bcryptjs                     |
| **Returns**     | `xirr`                             |

---

## 📋 Prerequisites

- **Node.js** 20.x+
- **pnpm** 10.30+
- **PostgreSQL** 14.x+
- **Redis** (required for price/balance caches)

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

### 3. Local infra (optional, via docker-compose)

A `docker-compose.yml` is provided that spins up PostgreSQL 17 and Redis 8.2 locally, plus an opt-in `sync-db` service that copies a Neon snapshot into your local Postgres for testing.

```bash
docker compose up -d postgres redis
```

### 4. Environment Setup

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://postgres@localhost:5432/appdb"

# Redis
REDIS_URL="redis://localhost:6379"

# Authentication
JWT_SECRET="your-secure-jwt-secret-key"

# Cron auth (required in production for /api/cron/sync-nav)
CRON_SECRET="your-cron-secret"

# Optional — only used by the docker-compose sync-db service
NEON_URL="postgresql://..."
```

### 5. Database Setup

```bash
pnpm prisma generate
pnpm prisma migrate dev
```

### 6. Start the Dev Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and sign up — your first user becomes the owner of the seeded account/asset hierarchy you create through the UI.

## 🏗️ Project Structure

```
ledger/
├── app/
│   ├── _actions/                    # Server Actions
│   │   ├── auth.ts                       # Sign up / log in / change creds (JWT)
│   │   ├── compute_balances.ts           # Balance aggregation + Redis cache
│   │   ├── flush.ts                      # Redis flushall (admin)
│   │   ├── resources.ts                  # Account / Asset CRUD with hierarchy
│   │   ├── templates.ts                  # Transaction template CRUD
│   │   ├── transactions.ts               # Create + delete (with invariant validation)
│   │   ├── transactions_update.ts        # Update (same validation pipeline)
│   │   └── validate_all_txns.ts          # Bulk integrity check
│   ├── _components/                 # Reusable React components
│   ├── _utils/
│   │   ├── currency_formatter.ts         # ₹ formatter
│   │   ├── date.ts                       # IST <-> UTC helpers
│   │   ├── normalize_txn.ts              # Fills nulls at read time
│   │   ├── orderStorage.ts               # Per-page sort/filter persistence
│   │   ├── price_fetcher.ts              # Yahoo Finance / AMFI bulk NAV sync
│   │   ├── validate_line_items.ts        # Invariant checks + line-item helpers
│   │   └── xirr_calculator.js            # Wraps the `xirr` package
│   ├── accounts/                    # Real & nominal account pages
│   ├── allocations/                 # Allocation pages
│   ├── api/
│   │   ├── cron/sync-nav/route.ts        # Daily AMFI NAV bulk pull (Vercel cron)
│   │   └── dump/route.ts                 # Authenticated SQL dump download
│   ├── assets/                      # Asset pages (incl. XIRR)
│   ├── income_expenses/             # Per-nominal-account flows
│   ├── login/                       # Auth UI
│   ├── settings/                    # Username / password change
│   ├── transactions/                # Transaction list / create / view / update
│   ├── ClientPage.tsx               # Dashboard (net worth + admin actions)
│   ├── layout.tsx                   # Root layout
│   └── page.tsx                     # Dashboard server component
├── lib/
│   ├── prisma.ts                    # Prisma client singleton (Neon adapter)
│   └── redis.ts                     # ioredis client singleton
├── prisma/
│   └── schema.prisma                # Database schema
├── generated/prisma/                # Generated Prisma client (engineType=client)
├── proxy.ts                         # Next.js proxy: JWT gate + x-user-id header
├── docker-compose.yml               # Local Postgres + Redis (+ optional Neon sync)
├── vercel.json                      # Vercel cron schedule for sync-nav
└── package.json
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
pnpm build            # prisma generate && next build
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm analyze          # Bundle size analysis (ANALYZE=true next build)

# Database
pnpm prisma generate    # Generate Prisma Client
pnpm prisma migrate dev # Run migrations
pnpm prisma studio      # Open Prisma Studio
```

## 📊 Database Schema

```prisma
model user {
  id            String @id @default(cuid())
  username      String @unique
  password_hash String

  accounts              account[]
  assets                asset[]
  transactions          transaction[]
  transaction_templates transaction_template[]
}

model account {
  id        String       @id @default(cuid())
  user_id   String
  name      String
  type      account_type   // real | nominal | allocation
  is_active Boolean      @default(true)

  parent_id String?
  parent    account?  @relation("AccountHierarchy", fields: [parent_id], references: [id])
  children  account[] @relation("AccountHierarchy")

  // ... line_items, template_items, user
}

model asset {
  id        String     @id @default(cuid())
  user_id   String
  name      String
  type      asset_type   // rupees | mf | etf | shares | other
  ticker    String?      // ISIN for MF, symbol for ETF/shares
  is_active Boolean    @default(true)

  parent_id String?
  parent    asset?  @relation("AssetHierarchy", fields: [parent_id], references: [id])
  children  asset[] @relation("AssetHierarchy")

  // ...
}

model transaction {
  id          String   @id @default(cuid())
  user_id     String
  datetime    DateTime
  description String?

  line_items line_item[]
}

model line_item {
  id          String    @id @default(cuid())
  description String?    // Optional per-line-item override
  datetime    DateTime?  // Optional per-line-item datetime override

  quantity   Decimal? @db.Decimal(14, 4)   // null in Allocation/Nominal => auto-derived
  book_value Decimal? @db.Decimal(14, 4)   // null for rupees, or auto-derived

  // transaction, account, asset relations + cascade on transaction delete
}

model transaction_template {
  id          String @id @default(cuid())
  user_id     String
  description String?
  line_items  line_item_template[]
}

model line_item_template {
  // Same shape as line_item, but no datetime — templates are pure shapes
  quantity   Decimal? @db.Decimal(14, 4)
  book_value Decimal? @db.Decimal(14, 4)
  // ... transaction_template, account, asset relations
}

enum account_type { real, nominal, allocation }
enum asset_type   { rupees, mf, etf, shares, other }
```

**Key Features:**

- `quantity` and `book_value` are nullable — the null-remainder pattern stores only Real entries plus any explicit splits; `normalize_txn` derives the rest at read time
- `Decimal(14, 4)` precision throughout — sufficient for fund-unit accuracy
- Hierarchical accounts/assets with cycle detection enforced at the application level
- Cascade deletion: deleting a transaction or template deletes all its line items
- Indexes on `user_id`, `datetime`, and the foreign keys hit by the hot paths

---

## 🔍 Integrity Checker

The `validate_all_txns` server action loads every transaction from the database, runs each through `validate_line_items`, and returns the list of any transactions that violate the invariants. It is wired to a button on the main dashboard.

**Checks performed:**

1. ✅ Real account line items never have `null` quantity
2. ✅ Allocation / Nominal groups each have exactly one `null` quantity placeholder
3. ✅ Book value rules are respected per asset type (Rupees: all null; non-Rupees: one null per Allocation/Nominal group)
4. ✅ Real-only transactions (transfers) have quantity (and book value, for non-Rupees) sums of zero

---

## ⏱️ Daily NAV Sync

`GET /api/cron/sync-nav` streams the AMFI bulk NAV file (`https://www.amfiindia.com/spages/NAVAll.txt`), filters down to ISINs that match a known `mf` asset in the DB, and pipelines them into Redis with a 2-day TTL under `price:nav:{ISIN}`. Vercel runs this daily at `0 2 * * *` (UTC) per `vercel.json`.

In dev or when the cache is missed, `get_nav` will trigger an in-process `sync_nav()` (deduplicated via a module-level promise) so the first request after a fresh boot still resolves.

---

## 💾 Caching Summary

| Cache                    | Key                          | TTL    | Invalidation                                |
| ------------------------ | ---------------------------- | ------ | ------------------------------------------- |
| ETF / shares price       | `price:etf:{symbol}`         | 2 days | TTL only                                    |
| MF NAV                   | `price:nav:{ISIN}`           | 2 days | Refreshed daily by the cron                 |
| Per-user balance maps    | `balances:{user_id}`         | 5 days | Overwritten after every txn create/update   |
| Negative-cache miss (MF) | `price:nav:{ISIN}` = `"null"` | 1 hour | TTL only — prevents tight retry loops       |

The dashboard exposes a **Flush Redis Cache** button that calls `flushall()` for emergencies.

---

## 🔒 Security

| Feature              | Implementation                                                                |
| -------------------- | ----------------------------------------------------------------------------- |
| Password Storage     | `bcryptjs`, 10 rounds                                                         |
| Session Management   | JWT (7 days) in HTTP-only, `lax`, `secure-in-prod` cookies                    |
| Route Gating         | `proxy.ts` verifies JWT on every non-public path before the request lands     |
| User Isolation       | All queries scoped to `user_id`; updates use composite `where: { id, user_id }` |
| SQL-injection Defense | `/api/dump` allowlists tablenames; everywhere else uses Prisma                |
| Cron Auth            | `Bearer ${CRON_SECRET}` required on `/api/cron/sync-nav` in production        |

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
- [`xirr`](https://www.npmjs.com/package/xirr) — Returns calculation

---

<p align="center">
  <strong>Built for financial accuracy. Enforced by mathematics.</strong>
</p>