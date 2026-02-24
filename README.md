# 📒 Ledger — Triple-Entry Personal Finance System

A sophisticated personal finance management application built with Next.js, implementing a unique **Triple-Entry Bookkeeping** system that enforces mathematical invariants to guarantee data integrity across every transaction.

[![Next.js](https://img.shields.io/badge/Next.js-16.0.7-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.0.1-2D3748?style=flat&logo=prisma)](https://www.prisma.io/)
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

## 🔒 Transaction Invariants (The Constraints)

Every transaction in this system must satisfy two fundamental invariants that are **enforced at the database level**:

### Invariant 1: Per-Asset Quantity Balance

For **each asset** in a transaction:

```
∑ quantity(Real Accounts) = ∑ quantity(Allocation Accounts) = ∑ quantity(Nominal Accounts)
```

If you spend 500 rupees from Google Pay, you must also record -500 in a nominal account (e.g., Expenses) AND -500 in an allocation account (e.g., Office Food).

### Invariant 2: Total Value Balance

Across all line items in a transaction:

```
∑ value(Real) = ∑ value(Allocation) = ∑ value(Nominal)
```

Where `value = book_value ?? quantity` (book_value defaults to quantity if not specified).

### Book Value Rules

| Asset Type                                | `book_value` Requirement                                   |
| ----------------------------------------- | ---------------------------------------------------------- |
| **Currency (Rupees)**                     | Must be `null` — quantity IS the value                     |
| **Non-currency (MF, ETF, Shares, Other)** | Must be provided — tracks cost basis separately from units |

This separation allows tracking of cost basis vs market value for investment assets.

---

## 💡 Transaction Examples

### Example 1: Simple Expense (₹35 for lunch)

```json
{
  "description": "Lunch at office cafeteria",
  "line_items": [
    { "account": "Google Pay", "type": "real", "asset": "Money", "quantity": -35 },
    { "account": "Expenses", "type": "nominal", "asset": "Money", "quantity": -35 },
    { "account": "Office Food", "type": "allocation", "asset": "Money", "quantity": -35 }
  ]
}
```

**Invariant Check:** Real (-35) = Allocation (-35) = Nominal (-35) ✅

### Example 2: Buying Mutual Fund Units (₹10,000)

```json
{
  "description": "SIP in Axis Bluechip Fund",
  "line_items": [
    { "account": "Bank HDFC", "type": "real", "asset": "Money", "quantity": -10000 },
    { "account": "Investments", "type": "nominal", "asset": "Money", "quantity": -10000 },
    { "account": "Equity MF", "type": "allocation", "asset": "Money", "quantity": -10000 },
    { "account": "Demat", "type": "real", "asset": "Axis Bluechip", "quantity": 50.25, "book_value": 10000 },
    { "account": "Investments", "type": "nominal", "asset": "Axis Bluechip", "quantity": 50.25, "book_value": 10000 },
    { "account": "Equity MF", "type": "allocation", "asset": "Axis Bluechip", "quantity": 50.25, "book_value": 10000 }
  ]
}
```

**Invariant Check for "Money":** -10000 = -10000 = -10000 ✅
**Invariant Check for "Axis Bluechip":** 50.25 = 50.25 = 50.25 ✅
**Value Balance:** (-10000 + 10000) = (-10000 + 10000) = (-10000 + 10000) = 0 ✅

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

**Note:** Transfers only involve Real accounts — no Nominal/Allocation entries needed since totals within Real already balance to zero.

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

### 🤖 AI-Powered Transaction Creation

- **Natural Language Input** — "Spent ₹500 on groceries from Google Pay"
- **Pattern Learning** — Learns from your last 10 transactions (cached for 48 hours)
- **Multi-Provider Support** — Groq (llama-3.3-70b) or OpenAI (gpt-4o)
- **Context Caching** — User accounts/assets cached for 48 hours to reduce token usage
- **Token Usage Transparency** — See exactly how many tokens each request consumes
- **IST Timezone Aware** — Parses relative dates ("yesterday", "last Monday") correctly for Indian timezone

### 🛡️ Data Integrity Tools

- **Integrity Checker** — Validates all invariants across the entire database:
  - No cycles in account/asset hierarchies
  - All tickers are valid and fetchable
  - Book value rules are respected
  - All transactions satisfy both invariants
- **Atomic Transactions** — All validation happens within database transactions

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
- **React 19 + Next.js 16** — Latest React features with App Router

---

## 🛠️ Technology Stack

| Layer           | Technology                         |
| --------------- | ---------------------------------- |
| **Framework**   | Next.js 16 (App Router)            |
| **Language**    | TypeScript 5                       |
| **UI**          | React 19, Tailwind CSS 4           |
| **ORM**         | Prisma 7                           |
| **Database**    | PostgreSQL (Neon Serverless)       |
| **Cache**       | Redis (ioredis)                    |
| **AI**          | OpenAI SDK (Groq/OpenAI providers) |
| **Market Data** | Yahoo Finance, AMFI India          |
| **Auth**        | JWT + bcrypt                       |

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

# Redis (optional)
REDIS_URL="redis://localhost:6379"

# Authentication
JWT_SECRET="your-secure-jwt-secret-key"

# AI Model Configuration
# Choose AI provider: 'groq' (default) or 'openai'
AI_MODEL_PROVIDER="groq"

# API Keys (configure based on your chosen provider)
# For Groq (uses llama-3.3-70b-versatile)
GROQ_API_KEY="your-groq-api-key"

# For OpenAI (uses gpt-4o)
OPENAI_API_KEY="your-openai-api-key"

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
│   │   ├── transactions.ts      # Core transaction creation with dual invariants
│   │   ├── transactions_update.ts # Transaction updates (same invariants)
│   │   ├── ai_transaction.ts    # AI-powered natural language parsing
│   │   ├── resources.ts         # Account/Asset CRUD with hierarchy
│   │   └── auth.ts              # JWT authentication
│   ├── _components/         # Reusable React components
│   ├── _utils/              # Utilities (price fetching, date handling)
│   ├── accounts/            # Account management
│   ├── ai-transaction/      # Natural language transaction UI
│   ├── allocations/         # Portfolio allocation views
│   ├── assets/              # Asset management
│   ├── income_expenses/     # Income/Expense tracking
│   ├── transactions/        # Transaction management
│   └── settings/            # User settings
├── prisma/
│   └── schema.prisma        # Database schema with enums
├── integrity_checker.ts     # Full-database integrity validation
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
pnpm prisma generate  # Generate Prisma Client
pnpm prisma migrate dev # Run migrations
pnpm prisma studio    # Open Prisma Studio

# Integrity Check
pnpm tsx integrity_checker.ts  # Validate all database invariants
```

## 📊 Database Schema

```prisma
model line_item {
  quantity   Decimal  @db.Decimal(14, 4)   // Units owned
  book_value Decimal? @db.Decimal(14, 4)   // Cost basis (null for currency)

  account    account  // Links to Real, Nominal, or Allocation account
  asset      asset    // Links to Rupees, MF, ETF, Shares, or Other
  transaction transaction
}

enum account_type { real, nominal, allocation }
enum asset_type { rupees, mf, etf, shares, other }
```

**Key Features:**

- Decimal(14,4) precision for financial accuracy
- Hierarchical accounts/assets with cycle detection
- Cascade deletion for referential integrity
- Optimized indexes on user_id, datetime, and foreign keys

---

## 🔍 Integrity Checker

Run comprehensive validation across your entire database:

```bash
pnpm tsx integrity_checker.ts
```

**Checks performed:**

1. ✅ No cycles in account hierarchy
2. ✅ No cycles in asset hierarchy
3. ✅ All tickers are valid and fetchable
4. ✅ Book value rules are respected (null for rupees, required for others)
5. ✅ No empty descriptions
6. ✅ All transactions satisfy both invariants

---

## 🤖 AI Transaction Flow

```
User Input: "Spent ₹120 on auto yesterday at 3pm from paytm"
                    │
                    ▼
        ┌─────────────────────┐
        │   Context Loading   │ ← Cached accounts/assets (48hr TTL)
        │   + Recent Patterns │ ← Last 10 transactions cached
        └─────────────────────┘
                    │
                    ▼
        ┌─────────────────────┐
        │   LLM Processing    │ ← Groq or OpenAI
        │   (JSON Response)   │
        └─────────────────────┘
                    │
                    ▼
        ┌─────────────────────┐
        │   Fuzzy Matching    │ ← Account/Asset name resolution
        │   + Validation      │
        └─────────────────────┘
                    │
                    ▼
        ┌─────────────────────┐
        │   User Confirmation │ ← Review before commit
        └─────────────────────┘
                    │
                    ▼
        ┌─────────────────────┐
        │   Invariant Check   │ ← Both constraints verified
        │   + DB Commit       │
        └─────────────────────┘
```

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
