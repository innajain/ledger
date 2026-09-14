# Rust migration plan

Status: proposal. Nothing implemented yet.

## Scope of what exists today

~27k LOC across two roughly equal halves:

| Layer                      | Files | LOC   | Notes                                                          |
| -------------------------- | ----- | ----- | -------------------------------------------------------------- |
| UI (`.tsx`)                | 93    | 13.4k | 18 pages, 49 `'use client'` components, 5.9k in `_components/` |
| Pure domain (`app/_utils`) | 40    | 5.8k  | ~1.8k of that is vitest — the porting asset                    |
| Services (`app/_core`)     | 9     | 2.3k  | `transactions_core` 768, `links` 800 (in `_utils`)             |
| MCP server                 | 3     | 2.5k  | ~60 tools                                                      |
| Actions / routes / lib     | 40    | 1.9k  | 15 `'use server'` files, 16 `route.ts`, `proxy.ts`             |

Schema: 16 models, 5 enums, 36 applied migrations, `cuid()` text ids, `Decimal(14,4)` money, all dates IST.

**Scope decision: Rust everywhere, not just the server.** Browser logic is authored in Rust (Leptos + WASM) — the expensive reading of "migrate to Rust", and the one chosen. The honest endpoint is a **~30-line JavaScript service-worker shim**: a service worker's entry script must be JS, so that file can be shrunk but not eliminated. Everything else, charts included, becomes Rust. See Reviewed alternatives for the Maud + htmx plan this replaces, which remains the fallback if Phase 4 stalls.

**The schema does not change, and neither does any backing service.** Same Neon database, same Redis, same blob store: no data migration, no object copying, no dual-write, no backfill. That is what makes this safe — you can run both stacks against prod data and diff their output. Every tempting infrastructure change (R2, dropping Redis, a new cache topology) is explicitly deferred past parity; bundling them into a language rewrite is how rewrites get abandoned.

## Target stack

Most production-grade Rust answer, in order of how settled each choice is:

| Concern       | Choice                                                                                           | Why this over the alternative                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP          | **axum** + tower-http                                                                            | The default serious Rust web stack; tower middleware replaces `proxy.ts` cleanly                                                                                                                                                                                                                                                                                                                                                      |
| UI            | **Leptos** (SSR + hydration), `leptos_axum` on the same router                                   | Decision: **browser logic is authored in Rust**, not just the server. `#[server]` functions are a direct analogue of the 15 `'use server'` files; `Resource` + `<Suspense>` replaces the `page.tsx`/`ClientPage.tsx` split. Pin the minor version — the API still moves between them. Maud + htmx was the alternative and remains the fallback (see Reviewed alternatives)                                                            |
| Interactivity | Leptos signals; `web-sys` / `wasm-bindgen` for browser APIs                                      | No htmx, no Alpine. `web-sys` covers `localStorage`, `FormData`, `fetch`, `File`, and `PushManager.subscribe` natively, so notifications and uploads need no hand-written JS                                                                                                                                                                                                                                                          |
| CSS           | **Tailwind 4** standalone binary, driven by `cargo-leptos`                                       | `content` globs point at `.rs`; `cargo leptos watch` runs it                                                                                                                                                                                                                                                                                                                                                                          |
| DB            | **sqlx 0.8** (`query_as!`, compile-time verified)                                                | Checks SQL against the real schema — the closest thing to Prisma's guarantees. SeaORM only if you miss the query builder                                                                                                                                                                                                                                                                                                              |
| Migrations    | **sqlx migrate**, baselined on the existing 36 via a rehearsed procedure (Phase 2)               | Prisma stays the migration owner until the rehearsal passes. `_sqlx_migrations` and `_prisma_migrations` are separate tables, so both can sit in the same database during the handover                                                                                                                                                                                                                                                |
| Decimal       | **rust_decimal**                                                                                 | Maps `NUMERIC(14,4)` natively                                                                                                                                                                                                                                                                                                                                                                                                         |
| Dates         | **jiff** (or chrono + chrono-tz)                                                                 | All IST logic funnels through one `ist` module                                                                                                                                                                                                                                                                                                                                                                                        |
| Auth          | **jsonwebtoken** + **bcrypt** (`bcrypt` crate, verify _and_ hash)                                | Both stacks must speak exactly one hash format while they coexist — see risk 10. Argon2 is a post-decommission upgrade, not part of this migration                                                                                                                                                                                                                                                                                    |
| Cache         | **Keep Redis** (Upstash free); **moka** only as a hot cache in front of it                       | Redis holds correctness state, not just speed: `auth:revoke_before:<uid>`, `balances:<uid>`, price/NAV and timeseries invalidation. Revocation stays on `auth:revoke_before:<uid>` in Redis, unchanged. A durable `user.tokens_valid_from` column is the better long-term design, but it is an auth-persistence change with no migration value — deferred to post-parity so the "no schema change" promise above stays literally true |
| Cron          | **Cloud Scheduler** → `/api/cron/*` (unchanged design)                                           | In-process schedulers don't survive scale-to-zero                                                                                                                                                                                                                                                                                                                                                                                     |
| Logs          | **tracing** + JSON subscriber                                                                    | Replaces pino; the `profile()` instrumentation becomes tracing spans                                                                                                                                                                                                                                                                                                                                                                  |
| Blob          | **Keep Vercel Blob** through cutover (`@vercel/blob` HTTP API from any host); R2 later, or never | `transaction_attachment.url`/`pathname` are stored per row, so changing stores is a real object-copy + column-rewrite migration. Do not bundle it with a language rewrite                                                                                                                                                                                                                                                             |
| Push          | **web-push** crate                                                                               | Same VAPID keys, same optional no-op behaviour                                                                                                                                                                                                                                                                                                                                                                                        |
| Misc          | `cuid` (v1, for id continuity), `qrcode` (server-side SVG), `reqwest`, `thiserror`, `insta`      | `qrcode` generates the UPI QR as SVG server-side, deleting the npm `qrcode` dep                                                                                                                                                                                                                                                                                                                                                       |
| MCP           | **rmcp** (official Rust SDK), streamable HTTP                                                    | OAuth 2.1 + PKCE is already hand-rolled — port `lib/mcp/oauth.ts` as-is                                                                                                                                                                                                                                                                                                                                                               |
| Charts        | **Hand-rolled SVG in Rust**, signals driving brush/zoom                                          | Replaces `lightweight-charts` outright rather than FFI-wrapping it. Server decimates the series (`value_timeseries` already does), the client renders SVG and owns pan/zoom. Deletes the last significant JS dependency — see the Phase 4 note                                                                                                                                                                                        |

### Free hosting

| Piece | Free tier                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App   | **Google Cloud Run**           | 2M req + 180k vCPU-s + 360k GiB-s/month on the always-free tier — though egress, builds and artifact storage can still bill a little. Rust cold start is ~50–150ms, so scale-to-zero is usable. `min-instances=0`, `max-instances=1` as a **temporary** cost and connection guard — not an architectural constraint; nothing in the design may depend on single-instance, and the cap should be raised once pooling and cache behaviour are measured |
| DB    | **Neon free**                  | **Pooled endpoint for runtime** (`sqlx` pool of 5); the unpooled/direct host is only for running migrations. An earlier draft had this backwards                                                                                                                                                                                                                                                                                                     |
| Redis | **Upstash free** (10k cmd/day) | Kept deliberately — see the cache row above. In-process state resets on every scale-to-zero cold start, which is far more frequent than the Redis outages the current fail-open code was written for                                                                                                                                                                                                                                                 |
| Blob  | **Vercel Blob** (unchanged)    | Stays on the current store and token; revisit R2 only after parity                                                                                                                                                                                                                                                                                                                                                                                   |
| Cron  | **Cloud Scheduler**            | 3 jobs free; you need 2                                                                                                                                                                                                                                                                                                                                                                                                                              |
| CI    | GitHub Actions                 | `cargo test` + `cargo clippy` + `sqlx prepare --check`                                                                                                                                                                                                                                                                                                                                                                                               |

Alternatives: an **Oracle Cloud always-free ARM VM** (4 OCPU / 24 GB, always on, no cold start) if you want a real box; Fly.io no longer has a free tier.

## Crate layout

```
Cargo.toml                 # workspace
crates/
  domain/                  # pure, zero I/O — port of app/_utils/*  (the ported vitest suite lives here)
  db/                      # sqlx models, enums, queries, migrations/
  core/                    # app/_core/* — services over db + domain
  integrations/            # yahoo, AMFI, web-push, blob store, price fetchers
  ui/                      # Leptos components, pages, #[server] fns — compiles to WASM *and* into the server
  web/                     # axum router, middleware, leptos_axum mount, asset serving
  mcp/                     # rmcp tools + OAuth 2.1 endpoints
  server/                  # bin: mounts web + mcp + cron routes; bin: seed
```

`domain` must compile without `sqlx` in its dependency tree. That boundary is what keeps the invariant logic testable and is already how `_utils` is written.

## Phases

### Phase 0 — spike (1–2 days, throwaway-able)

Build the thinnest possible vertical slice: axum + sqlx + **Leptos SSR/hydrate** rendering the real `/heads/account/[id]` page read-only from the prod DB, deployed to Cloud Run, Tailwind driven by `cargo-leptos`.

Because the Rust-frontend decision is the expensive one, the spike must actually test it:

- one `#[server]` function round-tripping a `rust_decimal::Decimal` **as a string**, asserted equal
- hydration clean on a page containing IST-formatted dates and money
- WASM bundle size measured after `wasm-opt -Oz`, on a throttled mobile profile
- **islands mode vs. full hydration** compared on that page — decide here, not in Phase 4
- a throwaway SVG line chart with a working brush, to size the chart rewrite

Add two spikes alongside it, because both are load-bearing and neither is provable on paper:

- **Blob**: authenticated `put` / `get` / `del` / `list` from `reqwest` against the real store _and_ the local emulator, plus whichever upload path you pick in risk 8 (proxy-through-Rust by default).
- **sqlx against the live schema**: `query_as!` over `transaction` + `line_item` with `NUMERIC(14,4)` → `rust_decimal` and the five Postgres enums, confirming `sqlx prepare` works against Neon.

Exit criteria: page renders correct balances; all spikes pass; bundle size and cold start measured; deploy is one command. **If this feels bad, stop here** — you've spent two days, not two months.

### Phase 1 — domain core + test parity (the foundation)

Port `app/_utils/*` in dependency order: `decimal` → `ist` → `normalize_txn` → `validate_line_items` → `lock_date` → `fifo` → `xirr_calculator` → `future_balance` → `value_timeseries_core` → `tax_compute` → `subtree_value` / `hierarchy_empty` / `line_item_preview` → `csv` / `zip` / `xlsx` / `sql_dump`.

Method: **golden vectors, not hand-translated assertions.** Add a one-off vitest run that dumps `{input, output}` JSON for every existing test case to `crates/domain/tests/fixtures/`, then assert byte-identical output in Rust. This turns 1.8k lines of existing tests into a regression net you cannot fake your way past.

Watch: the null-remainder scheme in `normalize_txn` (`Prisma.Decimal` → `rust_decimal`, no float anywhere), and decimal **division** in XIRR / FIFO / percentages, where rounding differs from decimal.js.

Then add **`proptest`** invariants on top of the fixtures — these catch the cases the existing suite never thought of:

- **Triple-entry equality, not sum-to-zero.** Per asset: `sum(account) == sum(allocation)` whenever the allocation group is non-empty, and `== sum(income_expense)` whenever that group is non-empty. Those sums are usually _non_-zero — they are zero only when the group is absent. The same equality holds for `txn_value`, with `txn_value == quantity` forced for `rupees` assets.
- **`normalize` is pure and deterministic, not idempotent.** Re-running it on its own output throws, by design: the normalizer requires exactly one null entry per group and normalization consumes it. Assert purity (inputs unmutated — it already deep-copies), determinism, and that `account` lines pass through untouched.
- **FIFO conserves _within_ available lots and discards the overshoot.** Over-selling is explicitly permitted: `compute_fifo_remaining` drains every lot and silently drops the excess (the `while` loop exits on `lots.length === 0`). Property: every remaining quantity is `>= 0` and `<= its original lot`, lots are consumed in date order, and groups are independent.
- **XIRR: assert correctness when it converges**, i.e. the NPV residual at the returned rate is near zero — not that arbitrary random cashflows converge at all.
- **Closing balances are not monotone** (expenses and withdrawals reduce them). Property: `closing_balance(head, cutoff)` equals the ordered prefix sum of that head's line items with effective datetime `<= cutoff`, for every cutoff.

Exit criteria: every fixture passes; proptest suites green at 10k cases; `domain` has no I/O deps.

### Phase 2 — data layer

sqlx models + enums for all 16 tables; then **baseline the migration history through a rehearsal**, not by hand-waving:

1. Restore a prod `pg_dump` into a disposable Postgres.
2. Record a normalised schema fingerprint of it (`pg_dump --schema-only`).
3. Import the 36 Prisma SQL files as sqlx migrations and seed `_sqlx_migrations` with their versions and sqlx-computed checksums on that instance.
4. Apply one new no-op migration via `sqlx migrate run` — proves the history is writable, not merely readable.
5. Separately, build a **blank** database from the Rust migration history alone.
6. Diff the two fingerprints over **application-owned objects only** — exclude `_prisma_migrations` and `_sqlx_migrations`, since a blank sqlx-built database has no Prisma bookkeeping table and a literal whole-schema diff would flag that irrelevant difference. Everything else must match exactly, index and constraint names included.

**Prisma stays the migration owner until step 6 passes.** `_sqlx_migrations` and `_prisma_migrations` are different tables, so both histories coexist safely through the handover. Then: port the 8 `$queryRaw` call sites (trigram search, export collectors, metrics); port the 16 `$transaction` blocks' shape as `sqlx::Transaction` passed by `&mut`, mirroring how `links.ts` already threads a `Tx`.

Keep the static-literal table/column discipline from `db_export.ts` — the lone bound param stays the user id.

Exit criteria: `sqlx prepare` is clean; a read of every table round-trips.

### Phase 2.5 — HTTP shell and auth

Moved ahead of the service port: every differential and integration test below needs real user scoping, so auth cannot come last.

axum router; tower middleware replacing `proxy.ts` (JWT cookie verify, `x-user-id` equivalent as a request extension, revocation check, per-request CSP nonce, rate limits); `get_current_user_id()` becomes an axum extractor; `ActionResult<T>` / `ok` / `err(code,msg)` becomes `Result<T, AppError>` carrying the same codes, so the MCP and web surfaces keep sharing them. MCP bearer auth lands here too.

Password hashing stays **bcrypt-only, both verify and hash**, for the whole migration. Rust must not rehash to argon2 while Node still exists: `bcryptjs` cannot verify an argon2 hash, so the first Rust login would silently lock that user out of the Node stack and destroy the rollback path. Argon2 migration is a separate post-decommission task (rehash-on-login, once only one stack can write hashes).

Only the cookie-issuing **login page** is deferred to Phase 4 — the auth machinery is done here.

Exit criteria: session revocation on password change and both login rate limits behave identically to Node.

### Phase 3 — MCP server first

Port `_core/*` behind the MCP tool surface **before touching any UI**. Reasons: it is pure JSON, it already covers essentially the whole domain (net worth, holdings, balances, XIRR, tax, transactions, approvals, heads, assets, templates, attachments), and it hands you the verification harness for everything else.

Order inside this phase: `balances_core` → `valuation_core` → read tools → `transactions_core` → `links` (800 LOC, the hardest single file: `linked_signature`, the anchor hard-block, `prepare_links_for_delete`, `backfill_links_for_account`) → `approvals_core` → resource/template/attachment CRUD.

**Verification harness:** a script that calls every read tool on both stacks with the same OAuth token against the same DB and diffs the JSON. Plus `validate_my_transactions` must return identical results. Run it after every commit in this phase.

Also land a **user-isolation suite** here rather than at the end: table-driven over all 16 models, asserting that user A cannot reach user B's rows through any read or write path. `/api/dump` leaked every user's rows and password hashes once; a rewrite is precisely when that class of bug returns.

Exit criteria: harness diff is empty across your real data; isolation suite green; the Rust MCP endpoint works from a real Claude connector (validate rmcp's streamable-HTTP handshake early — the one third-party-compat risk).

### Phase 4 — UI in Leptos

Biggest chunk, and the one the "everything in Rust" decision makes expensive. `cargo-leptos` builds server + WASM + Tailwind; `leptos_axum` mounts the app on the same router that already serves MCP and the API.

Mapping from the current architecture:

| Next                             | Leptos                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `page.tsx` server fetch          | `Resource` created in the page component                           |
| `ClientPage.tsx`                 | the same component's view, hydrated                                |
| `'use server'` action (15 files) | `#[server]` function — compiles to an axum handler + a client stub |
| `revalidatePath`                 | `Resource::refetch()`, or `ActionForm` + a refetch on success      |
| `loading.tsx`                    | `<Suspense>` / `<Transition>` fallback                             |
| `proxy.ts` redirect              | axum middleware (already done in Phase 2.5)                        |

Component triage of the 49 client components — almost all become ordinary Leptos components with signals. The ones that need real work:

- **`TransactionLineItems` (548 LOC)** — the hardest component: dynamic rows, the null-remainder preview, live validation. Port `line_item_preview.ts` into `domain` (Phase 1) so the same code runs in the WASM bundle and on the server. This is a real payoff of the Rust decision: one validator, compiled twice.
- **Charts (705 LOC across three components)** — **rewrite as SVG in Rust**, do not FFI-wrap `lightweight-charts`. Signals own brush window and hover; the server decimates the series. Budget 2–3 weeks; this is the single biggest new build in the plan, and it's what removes the last real JS dependency.
- **`HierarchyTree` (510 LOC)** — expand/collapse and reorder in signals; drag-reorder via `web-sys` pointer events.
- **`AttachmentUpload`** — `web-sys` `File`/`FormData` + `fetch` to the Rust upload proxy (risk 8).
- **`NotificationToggle`** — `PushManager.subscribe` via `web-sys`; keys and payloads stay server-side.
- **`UpiPayButton` (314 LOC)** — QR becomes a server-rendered SVG from the `qrcode` crate.
- **`PrivacyProvider`, `Toast`, `Combobox`, `FormComponents`** — plain signals/context, mechanical.
- **drop recharts entirely** (already a deferred cleanup item).

Two rules specific to this phase:

- **Serialize `Decimal` as a string across every `#[server]` boundary**, never as `f64`. A single serde default slip here silently rounds money.
- **No non-determinism in render.** Hydration mismatches come from `now()`, locale formatting and random ids; all IST formatting happens server-side through the one `ist` module.

Bundle and DX notes: full-hydration Leptos lands around 300–600 KB gzipped WASM — set `opt-level="z"`, `lto`, `wasm-opt -Oz`, and serve brotli via tower-http. Evaluate **islands mode** in Phase 0: for a read-heavy ledger it cuts the payload a lot, at the cost of a more constrained programming model. `cargo leptos watch` is meaningfully slower than `next dev`; that is a real, permanent DX cost of this decision.

Suggested page order (read-only → write; the login page lands here, on the Phase 2.5 machinery): heads list → head detail → asset detail → transactions list → transaction detail → home → tax → settings → requests inbox/outbox → transaction create/update → head/asset create/update → login.

Exit criteria: each page visually and numerically matches the Next version side by side; zero hydration warnings in the console; WASM bundle measured and budgeted; plus a **Playwright smoke suite** over the five flows that would break silently: create a transaction, edit one with shared lines, approve an inbound request, upload an attachment, change password → old session rejected.

### Phase 5 — the rest

Export/dump routes (the ZIP/xlsx/SQL builders come free from Phase 1), attachments (see the Blob risk below), price fetchers (`yahoo-finance2` → reqwest against the same endpoints; AMFI NAV text parser ports directly), push notifications, `profile()` → tracing spans writing `server_metric`/`slow_query`/`web_vital`, seed scripts as a `seed` bin, the dev query toaster (or drop it — tracing logs replace it).

### Phase 6 — cutover

Strangler fig: keep Vercel as the edge and add `vercel.json` rewrites sending migrated paths to Cloud Run, sharing `JWT_SECRET` so the cookie is valid on both sides (a Vercel rewrite is a server-side proxy, so the cookie travels). Migrate paths in the Phase 4 order, roll back by deleting a rewrite. Two Leptos-specific routing details, both of which must be set up **before the first page flips**:

- **Asset paths.** The rewrite set must include the hashed WASM/JS bundle (`/pkg/*`), or a migrated page renders and then fails to hydrate.
- **Server-function endpoints.** `#[server]` functions generate their own POST endpoints, and Leptos's default prefix is `/api` — which would collide head-on with the existing `/api/mcp`, `/api/export`, `/api/oauth/*` and friends. Set an explicit, unused prefix (`/rsfn/*`) in the server-fn configuration and rewrite that whole prefix to Cloud Run from day one. Otherwise a migrated page renders _and_ hydrates, then its actions and refetches quietly hit Next and 404.

Two hard rules while both stacks are live:

- **Exactly one writer per capability — and paths do not give you this.** A capability spans several surfaces: transaction writes are reachable from `/transactions/*`, from the UPI button on a head-detail page, from approval flows, and from MCP. So the Rust MCP going live in Phase 3 would make transaction writes live on _both_ stacks while Node still owns `/transactions`. Capabilities must therefore flip as a unit, tracked explicitly:

  | Capability                                  | Node web | Rust web | Node MCP | Rust MCP |
  | ------------------------------------------- | -------- | -------- | -------- | -------- |
  | Transaction writes (incl. UPI, future→real) | on       | off      | on       | off      |
  | Approval / link writes                      | on       | off      | on       | off      |
  | Resource (head/asset) writes                | on       | off      | on       | off      |
  | Template writes                             | on       | off      | on       | off      |
  | Attachment writes                           | on       | off      | on       | off      |
  | All reads                                   | on       | on       | on       | on       |

  Flipping a row means flipping every cell in it in one deploy. Until a row flips, the corresponding Rust **write** tools are compiled out or hard-disabled — Phase 3 exercises read tools only, which is all the diff harness needs.

- **Identical Redis cache keys and identical invalidation.** Both stacks share `balances:<uid>` and the price/timeseries keys. A Rust write that invalidates a differently-named key leaves the Node side serving stale balances — the sharpest coexistence hazard, and another reason Redis stays.

When every path is rewritten, move DNS to Cloud Run, delete the Vercel project, delete `package.json`.

### Phase 7 — decommission

Drop Node entirely: CI becomes cargo-only, the pre-commit hook becomes `cargo fmt` + `clippy`, `CLAUDE.md` and `README.md` get rewritten. Keep the vitest fixture dump script archived until you're confident.

## Effort

Rough, solo + agent assistance. The column is **engineer-weeks (40h of focused work)** — an earlier draft labelled these as elapsed part-time weeks, which made the totals internally inconsistent:

| Phase            | Est.                                   |
| ---------------- | -------------------------------------- |
| 0 spike          | 1–2 days                               |
| 1 domain         | 1–2 weeks                              |
| 2 data           | 1 week                                 |
| 2.5 HTTP/auth    | 1–2 weeks                              |
| 3 MCP + services | 4–6 weeks (`links.ts` is a week of it) |
| 4 UI (Leptos)    | 8–13 weeks (charts are 2–3 of it)      |
| 5 rest           | 1–2 weeks                              |
| 6–7 cutover      | 1–2 weeks                              |

**17–28 engineer-weeks ≈ 680–1120 hours.** At 15–20 h/week that is **roughly 9–16 months elapsed**; about 4–7 months full-time. The Leptos decision added 4–6 engineer-weeks over the Maud + htmx plan (13–21), almost all in Phase 4: framework learning curve, hydration debugging, and rewriting 705 LOC of charts as Rust SVG. Expect the UI phase to overrun.

Two earlier numbers in this document were wrong and are worth naming: "~3 months" did not match its own phase table, and the "13–21 elapsed weeks / 10–16 engineer-weeks" replacement was arithmetically impossible (13–21 weeks at 15–20 h/week is only 195–420 h). The phase estimates themselves never changed — only the label, which was the actual error.

For reference, a team-standard estimate of the **full** migration including the Rust UI — with integration/browser/security/soak gates, contract versioning and staged capability rollout — lands near 24–38 engineer-weeks. That overlaps the top of this range, so the two figures broadly agree; the remaining delta is process appropriate to a multi-user product, and this is a single-user ledger whose worst outage is your own evening. An earlier draft of this paragraph mischaracterised that estimate as server-side only.

The UI is the long pole and the least interesting work; the domain port is the risky work, but it is the part fully covered by fixtures.

## Top risks

1. **Decimal divergence.** Any mismatch in division/rounding silently corrupts money. Mitigated entirely by golden vectors — do not skip them.
2. **IST boundaries.** Closing balances (end-of-day), lock dates, future-transaction cutoffs, tax years. One `ist` module, ported and tested first.
3. **`links.ts`.** 800 LOC of cross-user state machine where `pending_by` always names who acts next, plus the anchor hard-block and lock-date bypass rules. Port only after the diff harness exists.
4. **Id continuity.** Use the `cuid` (v1) crate so new ids look like existing ones; mixed formats would work but make the data ugly.
5. **rmcp compatibility** with Claude's web/mobile connectors — test against the real client in Phase 3, not at the end.
6. **Leptos is the largest new risk in this plan, by choice.** Concretely: API churn between minor versions (pin it, and budget one framework migration mid-project); hydration mismatches, the signature bug class of this architecture; WASM bundle size on mobile; and slower iteration than `next dev`. None is fatal, but together they are why Phase 4 doubled. The Maud + htmx fallback exists for the case where they compound — and because `domain`, `db`, `core` and `mcp` are untouched by that switch, falling back costs only the UI phase, not the project.
7. **What Next gives you free** and Rust doesn't: image optimization, bundling, route caching, `revalidatePath`, the dev overlay. Replace with Tailwind standalone, cache-control headers, `Resource::refetch`, tracing.
8. **Vercel Blob's client-upload handshake is the largest unknown.** `put`/`del`/`list` are plain REST and port easily, but uploads today go browser-direct via `handleUpload` from `@vercel/blob/client` — a signed-token protocol (`onBeforeGenerateToken` → `allowedContentTypes` + `maximumSizeInBytes: 10MB` → direct PUT → completion callback) with no documented wire format to reimplement against. **Do not plan to reverse-engineer it.** Two options, decided in Phase 0: (a) **proxy uploads through the Rust server** — multipart POST to axum, then a server-side `put`; at a 10 MB cap this is entirely fine on Cloud Run and deletes the whole problem; or (b) stand up a **tiny Node blob-gateway** — one small service importing `@vercel/blob` that exposes `put` / `get` / `list` / `del` / upload behind _your own_ HTTP contract, which Rust calls. Option (a) is the default for uploads; option (b) is the fallback, and it deliberately covers **all four operations**, not just `/api/upload`, so nothing in the Rust codebase ever depends on a reverse-engineered Vercel wire protocol. The gateway is ~80 lines and gets deleted the day you move to an S3-compatible store — the one storage option with a published spec and a real SDK (`aws-sdk-s3`), which is a good reason to treat R2/S3 as the eventual destination even though it stays deferred past parity. Also verify the local Blob emulator path (`NEXT_PUBLIC_VERCEL_BLOB_API_URL`, port 3100) still works for dev.
9. **One hash format at a time.** While both stacks are live, exactly one password-hash format may exist in the database, and it must be bcrypt — what `bcryptjs` can read. Any argon2 row Rust writes is unreadable to Node and breaks login rollback for that user. Enforce it in code rather than by intention: the Rust auth module carries no argon2 dependency until Phase 7.
10. **Cloud Run cold start** on a scale-to-zero free tier: fine for Rust (~100ms) but Neon's own autosuspend adds ~500ms on the first query. Acceptable for a personal app; if not, Oracle's always-free VM removes both.

## Honest counterpoint

This is a multi-month rewrite (see the estimate above) of a working app that has no performance problem. The real wins are a single static binary, free always-on hosting, no npm dependency churn, and compile-time-checked SQL over a money schema. The real costs are the UI rewrite and most of a year of part-time work not spent shipping features. Phase 0 exists so you can test the premise for two days before committing.

## Reviewed alternatives

Two structural alternatives were considered and deliberately not taken. Recorded here so the reasoning survives.

### A versioned `/api/v1` as the coexistence seam

The alternative is to expose a stable REST contract from Rust first, point the existing React app at it, then swap the UI later. It is the right call when the frontend must keep shipping during the migration, or when several clients need one contract.

Not taken here because the seam in this plan is the **page**, not the API: Next keeps serving a route whole until Rust serves that route whole, so React never needs to talk to Rust. A `/api/v1` built purely for coexistence is real work that gets deleted at the end, and it adds a second write surface during exactly the window you want the fewest. The counter-argument is legitimate, though — if the UI phase stalls, standing up `/api/v1` and moving React onto it is the correct escape hatch, and the crate layout supports it unchanged (it is one more adapter over `core`).

To be explicit about a related critique: MCP is used here as an **adapter and a differential-testing surface**, never as the internal application contract. `core` stays the contract; MCP, the web handlers and any future REST all sit on top of it. MCP goes first only because it is the one surface that already exists in TypeScript, which makes it the only surface you can diff a Rust port against for free.

### Maud + htmx (not chosen — the fallback)

The original version of this plan targeted Axum + Maud templates + htmx, keeping `lightweight-charts`, Alpine sprinkles and `sw.js` as JavaScript. In the narrow sense that is the more _production-grade_ choice — no framework risk, no WASM payload, no hydration bug class — and it is 4–6 engineer-weeks cheaper.

It was not chosen because it does not meet the stated requirement: it removes Node and React but leaves browser application logic in hand-written JavaScript. Two things stay worth keeping in view:

- **It remains the live fallback.** Phases 0–3 and 5–7 are identical under either target; only Phase 4 differs. If Leptos proves painful — bundle size, hydration, or churn — swapping Phase 4 for Maud + htmx costs the UI work already done, not the migration.
- **Neither option reaches zero JavaScript.** Leptos gets to a ~30-line service-worker shim; Maud + htmx lands nearer 1–2k lines across charts and interactivity. The gap is large and real, which is what justifies the extra cost — but "zero JS" is not on the menu.

A third option, FFI-wrapping `lightweight-charts` via `wasm-bindgen` instead of rewriting the charts, was rejected: it trades readable JavaScript for unreadable binding glue and keeps the npm dependency. Rewriting as Rust SVG costs more up front and ends cleaner.
