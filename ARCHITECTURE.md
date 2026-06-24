# Ledger — Architecture Diagrams

## System Architecture

```mermaid
graph TB
    subgraph Edge["Edge — proxy.ts (Vercel)"]
        JWT[JWT Verification<br/>jose + HTTP-only cookie]
        CSP[Content-Security-Policy<br/>Per-request nonce]
        REV[Session Revocation<br/>Redis auth:revoke_before]
        HDR[x-user-id / x-username<br/>Header Injection]
    end

    subgraph Next["Next.js 16 App Router"]
        direction TB
        P1[page.tsx<br/>Server Component<br/>Data fetching only]
        P2[ClientPage.tsx<br/>UI / State / Interactivity]
        SA[Server Actions<br/>app/_actions/*]
        API[API Routes<br/>app/api/*]
    end

    subgraph Utils["Domain Logic — app/_utils"]
        NT[normalize_txn.ts<br/>Null-remainder fill]
        VL[validate_line_items.ts<br/>Invariant checks]
        LK[links.ts<br/>Cross-user approvals]
        HV[head_value.ts<br/>Balance valuation]
        FF[fifo.ts<br/>FIFO lot tracking]
        PF[price_fetcher.ts<br/>Market prices / AMFI NAV]
        VT[value_timeseries.ts<br/>Chart data + caching]
        XR[xirr_calculator.js<br/>Newton-Raphson XIRR]
    end

    subgraph Lib["Library — lib/"]
        PR[prisma.ts<br/>Singleton + $extends profiling]
        RD[redis.ts<br/>Instrumented ioredis]
        EN[env.ts<br/>Zod-validated env]
        RL[rate_limit.ts<br/>Fixed-window limiter]
        MP[metrics/profile.ts<br/>AsyncLocalStorage timing]
    end

    subgraph Data["Data Layer"]
        PG[Postgres 17 / Neon<br/>Prisma 7 ORM]
        RS[Redis 8<br/>Balances / Timeseries / Sessions]
        BL[Vercel Blob<br/>Attachments / Private files]
    end

    subgraph External["External"]
        YF[Yahoo Finance<br/>ETF / Share prices]
        AM[AMFI India<br/>Mutual Fund NAV]
    end

    JWT --> P1
    JWT --> API
    JWT --> SA
    HDR --> P1
    HDR --> SA

    P1 --> P2

    SA --> NT
    SA --> VL
    SA --> LK
    SA --> HV
    SA --> FF
    SA --> PF
    SA --> VT

    SA --> PR
    SA --> RD
    SA --> RL
    SA --> MP

    PR --> PG
    RD --> RS
    PF --> YF
    PF --> AM
    API --> BL
```

---

## Database Schema (Entity-Relationship)

```mermaid
erDiagram
    user ||--o{ accounting_head : "has"
    user ||--o{ transaction : "owns"
    user ||--o{ transaction_template : "owns"
    user ||--o{ push_subscription : "has"
    user ||--o{ transaction_link : "initiates as user_a"
    user ||--o{ transaction_link : "receives as user_b"

    accounting_head ||--o{ accounting_head : "parent/child (self-ref)"
    accounting_head ||--o{ line_item : "referenced in"
    accounting_head ||--o{ line_item_template : "referenced in"

    asset ||--o{ line_item : "priced in"
    asset ||--o{ line_item_template : "priced in"

    transaction ||--o{ line_item : "contains"
    transaction ||--o{ transaction_attachment : "has"
    transaction ||--o{ transaction_link : "referenced as txn_a"
    transaction ||--o{ transaction_link : "referenced as txn_b"

    transaction_template ||--o{ line_item_template : "contains"

    user {
        text id PK
        text username UK
        text password_hash
        boolean is_admin
        text upi_id
        text theme
        boolean masking_enabled
        decimal mask_threshold
    }

    accounting_head {
        text id PK
        text user_id FK
        text name
        enum type "account | income_expense | allocation"
        boolean is_active
        text parent_id FK "self-ref"
        text linked_user_id FK "cross-user"
    }

    asset {
        text id PK
        text name UK
        enum type "rupees | mf | etf | shares | other"
        text ticker
        text parent_id FK "self-ref"
    }

    transaction {
        text id PK
        text user_id FK
        timestamp datetime
        text description
    }

    line_item {
        text id PK
        text transaction_id FK
        text accounting_head_id FK
        text asset_id FK
        decimal quantity "nullable — null = remainder"
        decimal txn_value "nullable — null = remainder"
        text description
        timestamp datetime
    }

    transaction_link {
        text id PK
        text user_a_id FK
        text user_b_id FK
        text txn_a_id FK "nullable"
        text txn_b_id FK "nullable"
        enum pending_status "pending | approved | rejected"
        enum pending_kind "change | deletion"
        text pending_by
    }
```

---

## Request Lifecycle

```mermaid
sequenceDiagram
    participant B as Browser
    participant E as Edge (proxy.ts)
    participant N as Next.js Server
    participant A as Server Action
    participant U as Utils
    participant P as Prisma
    participant R as Redis
    participant Y as Yahoo/AMFI

    B->>E: GET /transactions
    E->>E: Verify JWT cookie
    E->>E: Set x-user-id header
    E->>E: Generate CSP nonce
    E->>N: Forward with headers

    N->>N: page.tsx (Server Component)
    N->>A: get_current_user_id()
    N->>A: get_or_compute_balances()
    A->>R: GET balances:{userId}
    R-->>A: Cache HIT (or MISS → compute from P)
    alt Cache MISS
        A->>P: Query line_items (normalized)
        P-->>A: Raw rows
        A->>U: normalize_txn()
        A->>U: aggregate into maps
        A->>R: SETEX 5d
    end
    A-->>N: balance maps
    N-->>E: Rendered HTML + RSC payload
    E-->>B: Response with CSP

    Note over B,N: === User Action (Create Transaction) ===

    B->>E: POST / (Server Action)
    E->>E: Verify + header injection
    E->>N: Forward action
    N->>A: create_transaction()

    A->>U: validate_line_items()
    U->>U: Check invariants
    U->>U: normalize_txn()

    A->>P: $transaction block
    P->>P: INSERT line_items
    P->>P: UPDATE balances cache key
    A->>U: create_links_for_account()
    U->>P: INSERT transaction_links
    A->>R: DEL balances:{userId}
    A->>R: INCR timeseries_version:{userId}
    A->>U: notify_request_pending()
    U->>P: Query push subscriptions
    U->>U: send_push_to_user() (fire-and-forget)

    A-->>B: ActionResult { ok: true }
```

---

## The Null-Remainder Pattern

```mermaid
flowchart LR
    subgraph Input["Raw Line Items (stored)"]
        A1["account: bank<br/>qty=100, val=1000"]
        A2["account: wallet<br/>qty=-50, val=-500"]
        IE1["income_expense: salary<br/>qty=null, val=null"]
        AL1["allocation: savings<br/>qty=null, val=null"]
    end

    subgraph Normalize["normalize_txn()"]
        N1["account sum = 50"]
        N2["IE group: null → 50"]
        N3["AL group: null → 50"]
    end

    subgraph Output["Normalized (computed)"]
        O1["bank: qty=100"]
        O2["wallet: qty=-50"]
        O3["salary: qty=50"]
        O4["savings: qty=50"]
    end

    subgraph Invariant["Invariant"]
        I1["sum(account qty) = 50"]
        I2["sum(IE qty) = 50"]
        I3["sum(allocation qty) = 50"]
    end

    Input --> Normalize
    Normalize --> Output
    Output --> Invariant
```

---

## Cross-User Approval Workflow

```mermaid
stateDiagram-v2
    [*] --> Pending: Transaction created<br/>with linked head

    Pending --> Approved: Counterparty approves
    Pending --> Rejected: Counterparty rejects
    Pending --> Pending: Original user edits<br/>(re-opens with changes)

    Approved --> Pending: Shared lines modified<br/>(change detected via signature)

    Approved --> [*]: Both users satisfied
    Rejected --> [*]: Counterparty declines
```

---

## Key Color Legend

| Color              | Meaning                  |
| ------------------ | ------------------------ |
| `#e1f5fe` (blue)   | Edge / Middleware layer  |
| `#f3e5f5` (purple) | Next.js App Router       |
| `#e8f5e9` (green)  | Domain logic / utilities |
| `#fff3e0` (orange) | Library / infra          |
| `#ffebee` (red)    | Data stores              |
| `#e8eaf6` (indigo) | External services        |

---

_Generated for Obsidian — render `.md` files with Mermaid enabled._
