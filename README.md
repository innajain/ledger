# Ledger — Triple-Entry Personal Finance System

A personal finance application built with Next.js, implementing a **Triple-Entry Bookkeeping** model that enforces mathematical invariants on every transaction to guarantee data integrity.

---

## The Philosophy: Triple-Entry Bookkeeping

Traditional double-entry bookkeeping tracks _where money came from_ and _where it went_. This system goes further — every line item is tagged with one **accounting head**, and each head has one of three types, balancing across all three **dimensions**:

| `accounting_head.type` | Purpose                                 | Examples                                  | UI Label           |
| ---------------------- | --------------------------------------- | ----------------------------------------- | ------------------ |
| **`account`**          | Where money physically exists           | Bank Account, Wallet, Google Pay, BHIM    | "Real Accounts"    |
| **`income_expense`**   | Income / expense classification (taxes) | Salary, Business Income, Groceries, Rent  | "Nominal Accounts" |
| **`allocation`**       | Budget / allocation category            | Office Food, Commute, Discretionary, Rent | "Allocations"      |

This answers three questions simultaneously:

1. **Where is the money?** (`account`)
2. **What income/expense head is it?** (`income_expense`)
3. **Which budget category does it affect?** (`allocation`)

The single underlying table is `accounting_head`; each row is one head with one of the three `type` values.

---

## Transaction Invariants & Storage Model

### The Null-Remainder Storage Model

Line items are stored in a **compressed format**: instead of repeating the same value across all three head types, the system stores only the `account` entries (which determine totals) plus any explicit splits on the `allocation` / `income_expense` side. The balancing entry in each group is stored as `null` and **computed at read time** by `normalize_txn`.

**Rules enforced on every save:**

| Side                                         | `quantity` rule                                                 | `txn_value` rule (non-rupees only)        |
| -------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| **`account`**                                | Must always be provided (never `null`)                          | Must always be provided                   |
| **`allocation`**                             | Exactly **one** item may be `null` (the auto-derived remainder) | Exactly one item may be `null`            |
| **`income_expense`**                         | Exactly **one** item may be `null` (the auto-derived remainder) | Exactly one item may be `null`            |
| **No `allocation` _or_ No `income_expense`** | `account` quantities must sum to **zero**                       | `account` txn values must sum to **zero** |

At read time, `normalize_txn` fills every `null` with:

```
null_qty = ∑ qty(account) − ∑ non-null qty(same head type)
```

After normalization the classic invariant always holds:

```
∑ quantity(account) = ∑ quantity(allocation) = ∑ quantity(income_expense)
```

### Txn Value Rules

| Asset Type                              | `txn_value` in `account` items                    | `txn_value` in `allocation` / `income_expense` |
| --------------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| **Rupees**                              | Must be `null` (quantity IS the value)            | Must be `null`                                 |
| **Non-rupees (MF, ETF, Shares, Other)** | Must be provided — cash flow amount for the trade | Exactly one `null` per group (auto-derived)    |

---

## Transaction Examples

### Example 1: Simple Expense (₹35 for lunch)

```json
{
  "description": "Lunch at office cafeteria",
  "line_items": [
    { "accounting_head": "Google Pay", "type": "account", "asset": "Money", "quantity": -35 },
    { "accounting_head": "Expenses", "type": "income_expense", "asset": "Money", "quantity": null },
    { "accounting_head": "Office Food", "type": "allocation", "asset": "Money", "quantity": null }
  ]
}
```

After normalization: account (−35) = allocation (−35) = income_expense (−35) ✅

### Example 2: Buying Mutual Fund Units (₹10,000)

```json
{
  "description": "SIP in Axis Bluechip Fund",
  "line_items": [
    { "accounting_head": "Bank HDFC", "type": "account", "asset": "Money", "quantity": -10000, "txn_value": null },
    { "accounting_head": "Investments", "type": "income_expense", "asset": "Money", "quantity": null },
    { "accounting_head": "Equity MF", "type": "allocation", "asset": "Money", "quantity": null },
    { "accounting_head": "Demat", "type": "account", "asset": "Axis Bluechip", "quantity": 50.25, "txn_value": 10000 },
    { "accounting_head": "Investments", "type": "income_expense", "asset": "Axis Bluechip", "quantity": null, "txn_value": null },
    { "accounting_head": "Equity MF", "type": "allocation", "asset": "Axis Bluechip", "quantity": null, "txn_value": null }
  ]
}
```

### Example 3: Transfer Between `account`-type Heads

```json
{
  "description": "Transfer from bank to wallet",
  "line_items": [
    { "accounting_head": "Bank HDFC", "type": "account", "asset": "Money", "quantity": -5000 },
    { "accounting_head": "Cash Wallet", "type": "account", "asset": "Money", "quantity": +5000 }
  ]
}
```

When there are no `allocation` or `income_expense` entries, the `account` quantities must sum to zero.

---

## System Notes

### Hierarchical Accounting Heads & Assets

Every accounting head and asset can have a `parent_id`, forming a tree. Cycle detection runs at the application layer on every parent change. Two flags shape visibility:

- **`is_active`** — Soft-delete; inactive entries are hidden from transaction selectors but retained for historical balance computation
- **`is_placeholder`** — Grouping-only parent; still appears in the hierarchy view but hidden from selectors

### Multi-Asset Portfolio Tracking

| Asset Type        | Ticker Required | Price Source             |
| ----------------- | --------------- | ------------------------ |
| Rupees            | No              | Fixed at 1               |
| Mutual Funds (MF) | Yes (ISIN)      | AMFI India NAV bulk feed |
| ETFs              | Yes             | Yahoo Finance            |
| Shares            | Yes             | Yahoo Finance            |
| Other             | No              | Cost basis only          |

Asset creation validates tickers by hitting the price source upfront. Non-rupees line items store `quantity` (units) and `txn_value` (cash flow) separately; asset detail pages compute FIFO remaining units by matching sells against buys in date order.

### XIRR Returns

- **Per-asset XIRR** — Computed from all cashflows implied by line items, with current market value as the closing flow
- **Portfolio XIRR** — Computed across the entire Investments allocation subtree
- **XIRR timeseries** — Charts include an XIRR % series computed at each historical date, reconciled against the live InfoCard value at the most recent point

### Privacy & Display

UI preferences live on the `user` row and sync across devices via [`update_user_preferences`](app/_actions/preferences.ts):

- **Amount masking** — Every rendered amount is click-toggleable. Values above a configurable threshold (default **₹50,000**) start hidden as `₹•••••` with currency symbol and sign preserved.
- **Graph visibility** — Value timeseries charts render behind a **Show graph** button; heavy chart libraries (`lightweight-charts`, `recharts`) aren't mounted while hidden. Flag is global and sticky.
- **Theme** — System / Light / Dark stored on the `user` row. The server injects the right class on `<html>` for explicit modes; an inline `<head>` script handles `system` mode before first paint to avoid FOUC.

Logged-out users get in-memory defaults; setters are no-ops without a session.

### UPI Payments

Each `account`-type head can carry an optional **UPI ID** (a standard VPA like `name@bank` or a phone-as-UPI-Number like `9876543210@upi`). When set, the account detail page renders a Pay banner. The button builds a `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…` deep link — used directly on mobile (OS picks the UPI app) or rendered as a scannable QR on desktop via [`qrcode`](https://www.npmjs.com/package/qrcode).

A `visibilitychange` listener (2-second debounce) prompts **"Mark as paid?"** after the user returns to the browser. Confirming triggers [`create_upi_payment`](app/_actions/transactions.ts), which records a two-line rupees transaction (default account `-amount`, payee account `+amount`) — no allocation / income_expense lines, by design.

When the payee balance is negative (you owe them), the amount and `reimbursement. balance settled` note are pre-filled. The URL is hand-built with `encodeURIComponent` instead of `URLSearchParams.toString()` so spaces encode as `%20` rather than `+` (UPI apps display `+` literally in the note otherwise).

### Transaction Templates

Reusable transaction shapes (rent, SIPs, payday splits). Stored as `transaction_template` + `line_item_template` rows; cascade-deleted with the user. Quick-load passes a chosen template into a fresh transaction via `sessionStorage` to prefill line items.

### Line-Item Defaults

Per-user defaults — one head per type plus a default asset — are pre-selected on new line items. Falls back to the first available head of each type when the saved one is deactivated.

### Transaction List

Search uses substring match across transaction + line-item descriptions, debounced 300 ms before the URL updates. Date sorts use SQL `orderBy`; amount sorts (and the amount filter) route through an in-memory scan capped at 5000 rows.

### Transaction Attachments

Files are stored in a **private** Vercel Blob store and served through an authenticated proxy so URLs aren't shareable.

- **Direct upload** — Browser uses `@vercel/blob/client` `upload()` with a server-issued client token; bytes go straight to Blob, bypassing Vercel's ~4.5 MB serverless body limit
- **Server-issued client tokens** — `/api/upload` validates auth, content type, and size via `handleUpload({ onBeforeGenerateToken })` before signing
- **Proxy display** — `/api/attachments/[id]` fetches the private blob with the store's read/write token, scopes the response to the transaction owner, streams it back with `Cache-Control: private, max-age=3600`. In dev, the proxy ignores the stored `url` (which still points at the prod `.private.blob.vercel-storage.com` host after a `sync-db` run) and reconstructs the fetch URL as `<NEXT_PUBLIC_VERCEL_BLOB_API_URL origin>/<pathname>` so it resolves to the local emulator
- **Local dev** — `docker compose up -d blob` runs the [payloadcms/vercel-blob-emulator](https://github.com/payloadcms/vercel-blob-emulator); the server SDK respects `VERCEL_BLOB_API_URL`
- **Orphan cleanup** — `/api/cron/cleanup-orphan-blobs` runs weekly, deleting any blob whose `pathname` isn't referenced in `transaction_attachment`. 1-hour grace period covers in-flight uploads

### Data Integrity

- **Integrity checker** — `validate_all_txns` runs every transaction through `validate_line_items` and reports invariant violations; wired to a dashboard button
- **Atomic writes** — All create/update flows run inside a Prisma `$transaction`
- **Balance cache** — `get_or_compute_balances` aggregates `accounting_head → asset` and `asset → accounting_head` maps via `normalize_txn`, caches in Redis (5-day TTL), and overwrites after every transaction write

### Database Dump

`GET /api/dump` streams a `.sql` file of `INSERT` statements for every user-data table. Auth-gated; table names are allowlisted to prevent injection.

### Security

- **JWT in HTTP-only cookies** — 7-day expiry, signed with `JWT_SECRET`
- **Edge proxy gate** — `proxy.ts` verifies the JWT on every non-public route, redirects to `/login` on failure, stamps `x-user-id` on the request header
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

## Frontend Architecture: Server-Wrapper Pattern

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
  default_account_id        String?
  default_allocation_id     String?
  default_income_expense_id String?
  default_asset_id          String?

  // UI preferences — synced across devices via update_user_preferences
  theme           String  @default("system") // light | dark | system
  masking_enabled Boolean @default(true)
  mask_threshold  Int     @default(50000)
  graphs_visible  Boolean @default(false)
}

model accounting_head {
  id             String               @id @default(cuid())
  user_id        String
  name           String
  type           accounting_head_type // account | income_expense | allocation
  is_active      Boolean              @default(true)
  is_placeholder Boolean              @default(false)
  parent_id      String?
  upi_id         String?              // VPA or phone-as-UPI-Number for the Pay button
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
  id                  String    @id @default(cuid())
  transaction_id      String
  accounting_head_id  String
  asset_id            String
  quantity            Decimal?  @db.Decimal(14, 4) // null in allocation / income_expense = auto-derived
  txn_value           Decimal?  @db.Decimal(14, 4) // null for rupees, or auto-derived
  description         String?
  datetime            DateTime? // per-line-item datetime override
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

enum accounting_head_type { account  income_expense  allocation }
enum asset_type            { rupees   mf              etf         shares  other }
```

Profiling tables (`server_metric`, `slow_query`, `web_vital`) live alongside the domain tables — see [Performance Profiling](#performance-profiling).

**Key design points:**

- `quantity` / `txn_value` nullable — null-remainder pattern; `normalize_txn` derives at read time
- `Decimal(14, 4)` throughout — sufficient for fund-unit precision
- Hierarchical accounting heads / assets with cycle detection at the application layer
- Cascade deletion: removing a transaction or template removes all its line items

---

## Local Stack & Prod Sync

`docker-compose.yml` spins up PostgreSQL 17, Redis, and the Vercel Blob emulator locally. An optional `sync-db` service copies a Neon snapshot — plus an optional prod Redis snapshot and an optional prod Vercel Blob snapshot — into the local stack.

```bash
docker compose up -d postgres redis blob
docker compose run --rm sync-db   # pulls prod Postgres + Redis + Blob into local
```

The sync logic lives in [`scripts/sync/sync.mjs`](scripts/sync/sync.mjs), mounted read-only into a `node:22-bookworm-slim` container. It always rebuilds local Postgres via `pg_dump | pg_restore` (PGDG `postgresql-client-17` because Bookworm only ships 15 and Neon is on 17). The Redis and Blob phases are gated on `PROD_REDIS_URL` and `PROD_BLOB_READ_WRITE_TOKEN` — when unset, that phase is skipped with a one-line note.

For Blob, the script drains prod into memory (path + bytes + content-type), then clears the local emulator and re-uploads. The `@vercel/blob` SDK reads `VERCEL_BLOB_API_URL` lazily on each call, so the script unsets it during the prod read and sets it to the emulator URL (`http://blob:3000/api/blob` inside the docker network) for the local writes. Prod URLs require an Authorization header (the store is private), and the script refuses to wipe local if prod listed blobs but none could be fetched.

### Migrating prod (Neon)

`PROD_DATABASE_URL` uses pgbouncer's pooled endpoint, which doesn't support Prisma's migration engine. Strip `-pooler` from the hostname and add a connect timeout to handle Neon's auto-suspend:

```bash
DIRECT_URL="$(grep '^PROD_DATABASE_URL=' .env | sed -E 's/^PROD_DATABASE_URL=//; s/^"(.*)"$/\1/; s/-pooler\././')" \
  DATABASE_URL="${DIRECT_URL}&connect_timeout=30" pnpm exec prisma migrate deploy
```

---

## Caching

| Cache                  | Key                                              | TTL        | Invalidation                                                              |
| ---------------------- | ------------------------------------------------ | ---------- | ------------------------------------------------------------------------- |
| ETF / shares price     | `price:etf:{symbol}`                             | 2 days     | TTL only                                                                  |
| MF NAV                 | `price:nav:{ISIN}`                               | 2 days     | Refreshed daily by cron                                                   |
| Historical NAV series  | `price:nav_history:{ISIN}`                       | 7 days     | TTL only; `"null"` sentinel for unknown ISINs (1 hour)                    |
| Historical ETF series  | `price:etf_history:{symbol}:{from_date}`         | 7 days     | TTL only                                                                  |
| AMFI ISIN → scheme map | `amfi:isin_to_scheme_code`                       | 30 days    | TTL only                                                                  |
| Per-user balances      | `balances:{user_id}`                             | 5 days     | Overwritten after every transaction write                                 |
| Timeseries version     | `timeseries_version:{user_id}`                   | Indefinite | `INCR` on every transaction write (invalidates frozen series by mismatch) |
| Frozen chart series    | `timeseries_frozen:{user_id}:{kind}:{entity_id}` | Indefinite | Embedded version checked against `timeseries_version` on read             |

The dashboard exposes a **Flush Redis Cache** button that calls `FLUSHALL`.

---

## Cron Jobs

Two scheduled routes wired into Vercel cron via `vercel.json`. Both require `Bearer ${CRON_SECRET}` in production.

| Route                            | Schedule (UTC) | Purpose                                                                                                                                                             |
| -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/cron/sync-nav`             | `0 2 * * *`    | Streams the AMFI bulk NAV file, filters ISINs matching known `mf` assets, pipelines them into Redis with a 2-day TTL.                                               |
| `/api/cron/cleanup-orphan-blobs` | `0 3 * * 0`    | Lists every blob in the Vercel Blob store, deletes any whose `pathname` isn't referenced in `transaction_attachment`. 1-hour grace period covers in-flight uploads. |

In development (or on cache miss) `get_nav` also triggers an in-process `sync_nav()` — deduplicated via a module-level promise — so the first request on a fresh boot still resolves.

---

## Integrity Checker

`validate_all_txns` loads every transaction, runs each through `validate_line_items`, and returns any that violate the invariants. Wired to a button on the dashboard.

Checks performed:

1. `account` line items never have `null` quantity
2. `allocation` / `income_expense` groups each have exactly one `null` quantity placeholder
3. Txn-value rules are respected per asset type
4. `account`-only transactions (transfers) have quantity and txn-value sums of zero

---

## Performance Profiling

Every server-rendered page is wrapped with `profile()` (see [`lib/metrics/profile.ts`](lib/metrics/profile.ts)), which uses Node's `AsyncLocalStorage` to attribute work to a per-request context. Prisma is `$extends`-instrumented to count queries and time them; ioredis is wrapped to track hits/misses; `recordCompute` / `recordExternal` helpers tag explicit spans.

Three tables collect the data:

| Table           | Per                          | Captures                                                                                                                     |
| --------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `server_metric` | page render                  | `total_ms`, `db_query_count` + `db_query_ms`, `redis_hits` / `misses` / `ms`, `external_*`, `compute_ms`, `route`, `user_id` |
| `slow_query`    | Prisma query above 100 ms    | `model`, `action`, `duration_ms` (linked to `server_metric`)                                                                 |
| `web_vital`     | LCP / INP / CLS / FCP / TTFB | `route`, `value`, `rating` — collected client-side via `next/web-vitals` and `sendBeacon`                                    |

Writes are fire-and-forget so profiling never blocks the response. Set `PROFILING=off` to disable the wrapper entirely (the page function runs untouched).
