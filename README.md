# Ledger — Triple-Entry Personal Finance System

A personal finance management application built with Next.js, implementing a **Triple-Entry Bookkeeping** system that enforces mathematical invariants to guarantee data integrity across every transaction.

[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.6-2D3748?style=flat&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-316192?style=flat&logo=postgresql)](https://www.postgresql.org/)

---

## The Philosophy: Triple-Entry Bookkeeping

Traditional double-entry bookkeeping tracks _where money came from_ and _where it went_. This system goes further — every transaction must balance across **three dimensions**:

| Account Type   | Purpose                           | Examples                                  |
| -------------- | --------------------------------- | ----------------------------------------- |
| **Real**       | Where money physically exists     | Bank Account, Wallet, Google Pay, BHIM    |
| **Nominal**    | Classification of the transaction | Expenses, Income, Salary, Investments     |
| **Allocation** | Budget/allocation category        | Office Food, Commute, Discretionary, Rent |

This answers three questions simultaneously:

1. **Where is the money?** (Real)
2. **What type of transaction is it?** (Nominal)
3. **Which budget category does it affect?** (Allocation)

---

## Transaction Invariants & Storage Model

### The Null-Remainder Storage Model

Line items are stored in a **compressed format**: instead of repeating the same value across all three account types, the system stores only the Real entries (which determine totals) plus any explicit splits on the Allocation/Nominal side. The balancing entry in each group is stored as `null` and **computed at read time** by `normalize_txn`.

**Rules enforced on every save:**

| Side                              | `quantity` rule                                                 | `txn_value` rule (non-rupees only)   |
| --------------------------------- | --------------------------------------------------------------- | ------------------------------------ |
| **Real**                          | Must always be provided (never `null`)                          | Must always be provided              |
| **Allocation**                    | Exactly **one** item may be `null` (the auto-derived remainder) | Exactly one item may be `null`       |
| **Nominal**                       | Exactly **one** item may be `null` (the auto-derived remainder) | Exactly one item may be `null`       |
| **No Allocation _or_ No Nominal** | Real quantities must sum to **zero**                            | Real txn values must sum to **zero** |

At read time, `normalize_txn` fills every `null` with:

```
null_qty = ∑ qty(Real) − ∑ non-null qty(same account type)
```

After normalization the classic invariant is always satisfied:

```
∑ quantity(Real) = ∑ quantity(Allocation) = ∑ quantity(Nominal)
```

### Txn Value Rules

| Asset Type                              | `txn_value` in Real items                         | `txn_value` in Allocation/Nominal           |
| --------------------------------------- | ------------------------------------------------- | ------------------------------------------- |
| **Rupees**                              | Must be `null` (quantity IS the value)            | Must be `null`                              |
| **Non-rupees (MF, ETF, Shares, Other)** | Must be provided — cash flow amount for the trade | Exactly one `null` per group (auto-derived) |

---

## Transaction Examples

### Example 1: Simple Expense (₹35 for lunch)

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

After normalization: Real (−35) = Allocation (−35) = Nominal (−35) ✅

### Example 2: Buying Mutual Fund Units (₹10,000)

```json
{
  "description": "SIP in Axis Bluechip Fund",
  "line_items": [
    { "account": "Bank HDFC", "type": "real", "asset": "Money", "quantity": -10000, "txn_value": null },
    { "account": "Investments", "type": "nominal", "asset": "Money", "quantity": null },
    { "account": "Equity MF", "type": "allocation", "asset": "Money", "quantity": null },
    { "account": "Demat", "type": "real", "asset": "Axis Bluechip", "quantity": 50.25, "txn_value": 10000 },
    { "account": "Investments", "type": "nominal", "asset": "Axis Bluechip", "quantity": null, "txn_value": null },
    { "account": "Equity MF", "type": "allocation", "asset": "Axis Bluechip", "quantity": null, "txn_value": null }
  ]
}
```

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

When there are no Allocation or Nominal entries the Real quantities must sum to zero.

---

## Features

### Hierarchical Accounts & Assets

- **Three account types** — Real, Nominal, Allocation with distinct purposes
- **Parent-child relationships** — Organize into a tree; cycle detection prevents circular references
- **Drag-to-reorder** — Child order is persisted to the database, so the hierarchy view is stable across sessions
- **`is_active`** — Deactivate accounts/assets without losing history; inactive accounts/assets are hidden from transaction selectors; a dedicated Inactive Accounts list on the Settings page shows all deactivated accounts with their type badges and edit links
- **`is_placeholder_acc`** — Mark an account as a grouping-only parent; placeholder accounts are hidden from transaction selectors while still appearing in the hierarchy view
- **`is_placeholder` on assets** — Same concept for assets: placeholder assets act as grouping parents and are hidden from transaction selectors

### Multi-Asset Portfolio Tracking

| Asset Type        | Ticker Required | Price Source             |
| ----------------- | --------------- | ------------------------ |
| Rupees            | No              | Fixed at 1               |
| Mutual Funds (MF) | Yes (ISIN)      | AMFI India NAV bulk feed |
| ETFs              | Yes             | Yahoo Finance            |
| Shares            | Yes             | Yahoo Finance            |
| Other             | No              | Cost basis only          |

- **Ticker validation** — Asset creation rejects invalid tickers by hitting the price source upfront
- **Txn value tracking** — `quantity` (units) and `txn_value` (cash flow amount) stored separately for non-rupees assets
- **FIFO remaining units** — Asset detail pages show the remaining quantity per buy lot using a FIFO match against sell entries
- **Live valuation** — Per-asset and per-allocation pages price holdings using the latest cached price; falls back to txn value when unavailable

### Interactive Charts

Every asset, account, and allocation detail page (and the dashboard) includes a timeseries chart showing **Invested vs Current Value** over time, with an optional **XIRR %** overlay series.

**Two interchangeable view modes:**

| Mode            | Library              | Controls                                                                          |
| --------------- | -------------------- | --------------------------------------------------------------------------------- |
| **Interactive** | `lightweight-charts` | Scroll to zoom, drag to pan, pinch-to-zoom (mobile), drag-to-zoom range selection |
| **Slider**      | `recharts` + Brush   | Drag handles to select a time window                                              |

Chart interactions:

- Scroll wheel zooms in/out on the time axis
- Click-and-drag pans the visible window
- Pinch gesture zooms on touch devices
- Browser-level zoom is suppressed to prevent accidental page scaling

### XIRR Returns

- **Per-asset XIRR** — Asset detail pages compute XIRR from all cashflows implied by line items, with current market value as the closing flow
- **Portfolio XIRR** — Dashboard computes XIRR across the entire Investments allocation subtree
- **XIRR timeseries** — Charts include an XIRR % series computed at each historical date point, reconciled against the live InfoCard value at the most recent point

### Transaction Templates

Reusable transaction shapes for recurring entries (rent, SIPs, payday splits):

- Create / update / delete templates from the transaction-create screen
- Quick-load a template into a new transaction (carried via `sessionStorage`) to prefill all line items
- Stored as `transaction_template` + `line_item_template` rows; cascade-deleted with the user

### Configurable Line-Item Defaults

Per-user default accounts and asset pre-selected when creating a new line item on the transaction create/update pages. Configured from the Settings page with dropdowns filtered by account type. Falls back to first available account of each type when no default is set or the saved account has been deactivated.

### Transaction Attachments

Upload images, PDFs, and text files (≤ 10 MB each) against any transaction. Files are stored in a **private** Vercel Blob store and served through an authenticated proxy route, so URLs aren't shareable.

- **Direct upload** — Browser uses `@vercel/blob/client` `upload()` with a server-issued client token; file bytes go straight to Blob storage (bypasses Vercel's ~4.5 MB serverless function body limit)
- **Server-issued client tokens** — `/api/upload` validates auth, content type, and size via `handleUpload({ onBeforeGenerateToken })` before signing a short-lived client token
- **Proxy display** — `/api/attachments/[id]` fetches the private blob with the read/write token, scopes it to the transaction owner, and streams it back with `Cache-Control: private, max-age=3600`
- **Local dev** — `docker compose up -d blob` runs the [payloadcms/vercel-blob-emulator](https://github.com/payloadcms/vercel-blob-emulator) so uploads stay on your laptop; the SDK respects `VERCEL_BLOB_API_URL`
- **Orphan cleanup cron** — `/api/cron/cleanup-orphan-blobs` runs weekly, listing every blob in the store and deleting any whose `pathname` isn't referenced in `transaction_attachment`. A 1-hour grace period protects in-flight uploads

### Data Integrity Tools

- **Integrity checker** — `validate_all_txns` loads every transaction, runs each through `validate_line_items`, and surfaces any that violate the invariants; wired to a button on the dashboard
- **Atomic writes** — All create/update flows run inside a Prisma `$transaction`
- **Balance cache** — `get_or_compute_balances` aggregates `account → asset` and `asset → account` balance maps via `normalize_txn` and caches them in Redis (5-day TTL); overwritten after every transaction write

### Database Dump

`GET /api/dump` streams a `.sql` file containing `INSERT` statements for every user-data table (auth-gated; table names are allowlisted to prevent injection).

### Security

- **JWT in HTTP-only cookies** — 7-day expiry, signed with `JWT_SECRET`
- **Edge proxy gate** — `proxy.ts` verifies the JWT on every non-public route, redirects to `/login` on failure, and stamps `x-user-id` on the request header
- **bcryptjs** — 10 rounds
- **User isolation** — Every query scoped to `user_id`; updates use composite `where: { id, user_id }`
- **Cron auth** — All `/api/cron/*` routes require `Bearer ${CRON_SECRET}` in production

---

## Technology Stack

| Layer            | Technology                          |
| ---------------- | ----------------------------------- |
| **Framework**    | Next.js 16.1 (App Router)           |
| **Language**     | TypeScript 5                        |
| **UI**           | React 19, Tailwind CSS 4            |
| **ORM**          | Prisma 7.6 (`prisma-client` engine) |
| **Database**     | PostgreSQL (Neon Serverless)        |
| **Cache**        | Redis (ioredis)                     |
| **File storage** | Vercel Blob (private, proxied)      |
| **Market data**  | Yahoo Finance, AMFI India           |
| **Auth**         | JWT + bcryptjs                      |
| **Returns**      | `xirr`                              |

---

## Prerequisites

- **Node.js** 20.x+
- **pnpm** 10.30+
- **PostgreSQL** 14+
- **Redis**

## Getting Started

### 1. Clone

```bash
git clone https://github.com/innajain/ledger.git
cd ledger
```

### 2. Install

```bash
pnpm install
```

### 3. Local infrastructure (optional)

`docker-compose.yml` spins up PostgreSQL 17, Redis, and the Vercel Blob emulator locally. An optional `sync-db` service can copy a Neon snapshot (and optionally a prod Redis snapshot) into the local stack for testing.

```bash
docker compose up -d postgres redis blob

# One-shot: pull prod data into local Postgres (and Redis if PROD_REDIS_URL is set)
docker compose run --rm sync-db
```

### 4. Environment

Create `.env` in the project root (see `example.env` for the full list):

```env
DATABASE_URL="postgresql://postgres@localhost:5432/appdb"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-secure-jwt-secret-key"
CRON_SECRET="your-cron-secret"

# Production Neon DB (used by sync-db and prod migrations)
NEON_URL="postgresql://..."

# Optional: prod Redis snapshot source for sync-db
# PROD_REDIS_URL="redis://..."

# Vercel Blob — local emulator
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_local_dev"
VERCEL_BLOB_API_URL="http://localhost:3100/api/blob"
NEXT_PUBLIC_VERCEL_BLOB_API_URL="http://localhost:3100/api/blob"
# In production set BLOB_READ_WRITE_TOKEN to a real (private) store token
# and omit the *_VERCEL_BLOB_API_URL variables.

# Optional: disable performance profiling (default: on)
# PROFILING=off
```

### 5. Database setup

```bash
pnpm exec prisma generate
pnpm exec prisma migrate dev
```

### 6. Start

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and sign up.

---

## Project Structure

```
ledger/
├── app/
│   ├── _actions/
│   │   ├── _result.ts               # Discriminated ActionResult type
│   │   ├── attachments.ts           # save_attachments / delete_attachment
│   │   ├── auth.ts                  # Sign up / log in / JWT / change credentials
│   │   ├── compute_balances.ts      # Balance aggregation + Redis cache
│   │   ├── flush.ts                 # Redis FLUSHALL (admin)
│   │   ├── preferences.ts           # Per-user line-item defaults (read/write)
│   │   ├── resources.ts             # Account / Asset CRUD with hierarchy + cycle detection
│   │   ├── templates.ts             # Transaction template CRUD
│   │   ├── transactions.ts          # Create transaction (validation + write)
│   │   ├── transactions_update.ts   # Update transaction (same validation pipeline)
│   │   └── validate_all_txns.ts     # Bulk integrity checker
│   ├── _components/                 # Shared React components
│   │   ├── AccountForm.tsx          # Create/Update forms for all account types
│   │   ├── AccountFormComponents.tsx# Reusable form primitives (inputs, selects, actions)
│   │   ├── AttachmentUpload.tsx     # Drag-and-drop attachment uploader (private Blob)
│   │   ├── HierarchyTree.tsx        # Recursive tree display
│   │   ├── HoldingsGrid.tsx         # Asset holdings grid
│   │   ├── TransactionLineItems.tsx # Line-item editor (grouped by account type)
│   │   └── ...                      # Toast, Navbar, LocalDateTime, etc.
│   ├── _utils/
│   │   ├── currency_formatter.ts    # ₹ formatters
│   │   ├── date.ts                  # IST ↔ UTC helpers
│   │   ├── decimal.ts               # Prisma Decimal helpers
│   │   ├── line_item_defaults.ts    # pickDefaultAccount / pickDefaultAsset helpers
│   │   ├── normalize_txn.ts         # Fills null quantities at read time
│   │   ├── orderStorage.ts          # Per-page sort persistence (localStorage)
│   │   ├── price_fetcher.ts         # Yahoo Finance / AMFI NAV sync + Redis cache
│   │   └── validate_line_items.ts   # Invariant checks on line items
│   ├── accounts/                    # Real account pages (list / detail / create / update)
│   ├── allocations/                 # Allocation pages
│   ├── api/
│   │   ├── attachments/[id]/route.ts          # Authenticated proxy that streams private blobs
│   │   ├── cron/sync-nav/route.ts             # Daily AMFI NAV bulk pull (Vercel cron)
│   │   ├── cron/cleanup-orphan-blobs/route.ts # Weekly orphan-blob sweep (Vercel cron)
│   │   ├── dump/route.ts                      # Authenticated SQL dump download
│   │   ├── metrics/web-vital/route.ts         # Web Vitals ingestion (sendBeacon target)
│   │   └── upload/route.ts                    # handleUpload() — issues client tokens for Blob
│   ├── assets/                      # Asset pages (list / detail with XIRR + FIFO / create / update)
│   ├── income_expenses/             # Nominal account pages
│   ├── login/                       # Auth UI
│   ├── settings/                    # Username / password / theme / line-item defaults
│   ├── transactions/                # Transaction list / detail / create / update
│   ├── ClientPage.tsx               # Dashboard (net worth, investments XIRR, admin actions)
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── prisma.ts                    # Prisma singleton (PrismaPg adapter) + profiling $extends
│   ├── redis.ts                     # ioredis singleton + per-request hit/miss counters
│   ├── env.ts                       # Typed env var access
│   ├── logger.ts                    # Pino logger
│   └── metrics/                     # AsyncLocalStorage request context + profile() HOC + persist
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── generated/prisma/                # Generated Prisma client (engineType=client)
├── proxy.ts                         # JWT gate + x-user-id header injection
├── docker-compose.yml               # Local Postgres, Redis, Vercel Blob emulator (+ optional sync-db)
├── vercel.json                      # Cron schedules (sync-nav + cleanup-orphan-blobs)
└── package.json
```

### Frontend Architecture: Server-Wrapper Pattern

Every route is a thin server component that fetches data, then delegates all rendering and interactivity to a client component:

```
app/accounts/
├── page.tsx        # Server component — data fetching
└── ClientPage.tsx  # Client component — all UI, state, effects
```

---

## Database Schema

```prisma
model user {
  id            String  @id @default(cuid())
  username      String  @unique
  password_hash String
  is_admin      Boolean @default(false)

  // Per-user defaults for new line items (stored as plain IDs;
  // ownership validated in the server action)
  default_real_account_id       String?
  default_allocation_account_id String?
  default_nominal_account_id    String?
  default_asset_id              String?
}

model account {
  id                 String       @id @default(cuid())
  user_id            String
  name               String
  type               account_type // real | nominal | allocation
  is_active          Boolean      @default(true)
  is_placeholder_acc Boolean      @default(false)
  parent_id          String?
}

model asset {
  id        String     @id @default(cuid())
  user_id   String
  name      String
  type      asset_type // rupees | mf | etf | shares | other
  ticker    String?    // ISIN for MF, symbol for ETF/Shares
  is_active Boolean    @default(true)
  parent_id String?
}

model transaction {
  id          String                   @id @default(cuid())
  user_id     String
  datetime    DateTime
  description String?
  line_items  line_item[]
  attachments transaction_attachment[]
}

model transaction_attachment {
  id             String   @id @default(cuid())
  transaction_id String
  url            String   // Vercel Blob URL (private)
  pathname       String   // Used as the storage key for proxy fetch and orphan-cleanup
  filename       String
  content_type   String?
  size           Int?
  created_at     DateTime @default(now())
}

model line_item {
  id             String    @id @default(cuid())
  transaction_id String
  account_id     String
  asset_id       String
  quantity       Decimal?  @db.Decimal(14, 4) // null in Allocation/Nominal = auto-derived
  txn_value      Decimal?  @db.Decimal(14, 4) // null for rupees, or auto-derived
  description    String?
  datetime       DateTime? // per-line-item datetime override
}

model transaction_template {
  id          String               @id @default(cuid())
  user_id     String
  description String?
  line_items  line_item_template[]
}

model line_item_template {
  // Same shape as line_item, no datetime
  quantity   Decimal? @db.Decimal(14, 4)
  txn_value  Decimal? @db.Decimal(14, 4)
}

enum account_type { real  nominal  allocation }
enum asset_type   { rupees  mf  etf  shares  other }
```

Profiling tables (`server_metric`, `slow_query`, `web_vital`) live alongside the domain tables — see the [Performance Profiling](#performance-profiling) section.

**Key design points:**

- `quantity` / `txn_value` nullable — null-remainder pattern; `normalize_txn` derives at read time
- `Decimal(14, 4)` throughout — sufficient for fund-unit precision
- Hierarchical accounts/assets with cycle detection at the application layer
- Cascade deletion: removing a transaction or template removes all its line items

---

## Available Scripts

```bash
pnpm dev                              # Development server
pnpm build                            # prisma generate + next build
pnpm start                            # Production server
pnpm typecheck                        # tsc --noEmit
pnpm test                             # vitest run
pnpm lint                             # ESLint
pnpm analyze                          # Bundle analysis (ANALYZE=true next build)

pnpm exec prisma generate             # Regenerate Prisma client after schema changes
pnpm exec prisma migrate dev --name X # Create + apply migration to dev DB
pnpm exec prisma migrate deploy       # Apply pending migrations to prod
pnpm exec prisma studio               # Prisma Studio GUI
```

### Migrating prod (Neon)

The stored `NEON_URL` uses pgbouncer's pooled endpoint which doesn't support Prisma's migration engine. Strip `-pooler` from the hostname and add a connect timeout to handle Neon's auto-suspend:

```bash
DIRECT_URL="$(grep '^NEON_URL=' .env | sed -E 's/^NEON_URL=//; s/^"(.*)"$/\1/; s/-pooler\././')" \
  DATABASE_URL="${DIRECT_URL}&connect_timeout=30" pnpm exec prisma migrate deploy
```

---

## Caching

| Cache                       | Key                                | TTL        | Invalidation                                                    |
| --------------------------- | ---------------------------------- | ---------- | --------------------------------------------------------------- |
| ETF / shares price          | `price:etf:{symbol}`               | 2 days     | TTL only                                                        |
| MF NAV                      | `price:nav:{ISIN}`                 | 2 days     | Refreshed daily by cron                                         |
| Per-user balances           | `balances:{user_id}`               | 5 days     | Overwritten after every transaction write                       |
| NAV negative-cache          | `price:nav:{ISIN}` = `"null"`      | 1 hour     | TTL only                                                        |
| Historical price timeseries | `timeseries:{asset_id}:{...range}` | Indefinite | Only for frozen (past) date ranges; live ranges use normal TTLs |

The dashboard exposes a **Flush Redis Cache** button that calls `FLUSHALL`.

---

## Cron Jobs

Two scheduled routes wired into Vercel cron via `vercel.json`. Both require `Bearer ${CRON_SECRET}` in production.

| Route                            | Schedule (UTC) | Purpose                                                                                                                                                             |
| -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/cron/sync-nav`             | `0 2 * * *`    | Streams the AMFI bulk NAV file, filters ISINs matching known `mf` assets, and pipelines them into Redis with a 2-day TTL.                                           |
| `/api/cron/cleanup-orphan-blobs` | `0 3 * * 0`    | Lists every blob in the Vercel Blob store, deletes any whose `pathname` isn't referenced in `transaction_attachment`. 1-hour grace period covers in-flight uploads. |

In development (or on cache miss) `get_nav` also triggers an in-process `sync_nav()` — deduplicated via a module-level promise — so the first request on a fresh boot still resolves.

---

## Integrity Checker

`validate_all_txns` loads every transaction, runs each through `validate_line_items`, and returns any that violate the invariants. Wired to a button on the dashboard.

Checks performed:

1. Real line items never have `null` quantity
2. Allocation / Nominal groups each have exactly one `null` quantity placeholder
3. Txn-value rules are respected per asset type
4. Real-only transactions (transfers) have quantity and txn-value sums of zero

---

## Performance Profiling

Every server-rendered page is wrapped with `profile()` (see [`lib/metrics/profile.ts`](lib/metrics/profile.ts)), which uses Node's `AsyncLocalStorage` to attribute work to a per-request context. Prisma is `$extends`-instrumented to count queries and time them; ioredis is wrapped to track hits/misses; `recordCompute` / `recordExternal` helpers tag explicit spans.

Three tables collect the data:

| Table           | Per                          | Captures                                                                                                                     |
| --------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `server_metric` | page render                  | `total_ms`, `db_query_count` + `db_query_ms`, `redis_hits` / `misses` / `ms`, `external_*`, `compute_ms`, `route`, `user_id` |
| `slow_query`    | Prisma query above 100 ms    | `model`, `action`, `duration_ms` (linked to `server_metric`)                                                                 |
| `web_vital`     | LCP / INP / CLS / FCP / TTFB | `route`, `value`, `rating` — collected client-side via `next/web-vitals` and `sendBeacon`                                    |

Writes are fire-and-forget so profiling never blocks the response. Set `PROFILING=off` in the environment to disable the wrapper entirely (the page function runs untouched).

---

## License

Private and proprietary. All rights reserved.
