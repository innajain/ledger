# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal-finance app built on a **triple-entry bookkeeping** model (Next.js 16 App Router, React 19, Prisma 7, Postgres/Neon, Redis, Vercel Blob). `README.md` is the canonical reference for the domain model — the null-remainder storage scheme, transaction invariants, XIRR, caching keys, cron jobs, and the local/prod sync stack. Read it before touching transaction, balance, or pricing code. Note it predates two subsystems that hook into every transaction write — **cross-user linked accounts / approvals** and **push notifications** — documented in their own sections below; for those, the code is the reference. This file covers commands, conventions, and the wiring that spans multiple files.

## Commands

Package manager is **pnpm** (pinned `pnpm@11.1.2`); npm/npx are rejected. Always `pnpm <script>` / `pnpm exec <bin>`.

```bash
pnpm dev                       # next dev
pnpm build                     # prisma generate && next build
pnpm typecheck                 # tsc --noEmit
pnpm lint                      # eslint
pnpm format                    # prettier --write .
pnpm test                      # vitest run (all)
pnpm test -- normalize_txn     # single test file by name substring
pnpm test:watch                # vitest watch
pnpm analyze                   # ANALYZE=true next build (bundle analyzer)
```

Tests are colocated `*.test.ts` files (e.g. `app/_utils/normalize_txn.test.ts`); vitest resolves the `@/` alias. A pre-commit hook (simple-git-hooks + lint-staged) runs prettier+eslint on staged files.

**CI** (`.github/workflows/ci.yml`, on push/PR to `main`) is the full gate: `prisma generate` → `pnpm typecheck` → `pnpm lint` → `pnpm test` → `prettier --check`. Run those locally before pushing — CI reaches no DB (tests are pure units; a placeholder `DATABASE_URL` satisfies `prisma.config.ts`). A nightly `db-backup.yml` `pg_dump`s prod into a 30-day artifact.

**Seed scripts** — idempotent (wipe + recreate a single user), deterministic PRNG: `pnpm dlx tsx scripts/seed_sample_user.ts` (user `rahul` / `rahul1234`) or `scripts/seed_demo.ts` (`demo` / `demo1234`). They read `DATABASE_URL`; point it at the unpooled Neon host to seed prod.

## Local stack

```bash
docker compose up -d postgres redis blob   # Postgres 17, Redis, Vercel Blob emulator
docker compose run --rm sync-db            # pull prod Postgres (+ optional Redis/Blob) into local
```

Copy `example.env` → `.env`. The Blob emulator listens on `localhost:3100`; `NEXT_PUBLIC_VERCEL_BLOB_API_URL` points the SDK at it in dev.

## Prisma

- Generated client lives at **`generated/prisma`** (not `node_modules`), imported as `@/generated/prisma/client` and `@/generated/prisma/enums`. `build` runs `prisma generate` first.
- Schema: `prisma/schema.prisma`. Connection comes from `DATABASE_URL` via `prisma.config.ts`.
- **Never hand-write migrations** — use `pnpm exec prisma migrate dev --name <name>`.
- Migrating prod (Neon): the pooled `PROD_DATABASE_URL` can't run the migration engine. Strip `-pooler` from the host (see README "Migrating prod") and use `prisma migrate deploy`.
- All DB names are `snake_case` (tables, columns, and by convention functions/actions too).
- The README's schema block is a simplified reference (omits Prisma relation syntax and index annotations) — `prisma/schema.prisma` is the canonical shape.

## Architecture conventions

- **Server-wrapper pattern**: each route is `page.tsx` (server component, data fetching only) delegating to `ClientPage.tsx` (all UI/state/effects). Follow this when adding routes.
- **Server actions** live in `app/_actions/*` (`'use server'`) when shared across routes; an action used by exactly one page is colocated in that route folder instead (e.g. `transactions/[id]/update/transactions_update.ts`, `settings/flush.ts`, `settings/validate_all_txns.ts`). They return the discriminated `ActionResult<T>` from `_result.ts` — `ok(data, msg)` / `err(code, msg)`; use `fromError` in catch blocks (it maps Prisma P2002/P2003/P2025). Don't throw across the action boundary except for admin guards. Inside a `$transaction` callback, throw `ActionError(code, msg)` to abort the tx — the surrounding try catches it and `fromError` preserves the code. Log failures via `logger` (`lib/logger.ts`, pino) before returning.
- **Auth & user scoping**: `proxy.ts` (Next 16's middleware equivalent — note the filename) verifies the JWT cookie and stamps a trusted `x-user-id` header, stripping any client-supplied value first. In actions, get the caller via `get_current_user_id()` / `get_current_user()` from `_actions/auth.ts` (both `react.cache`-wrapped, header-first to avoid a DB hit). **Session revocation:** tokens carry an `iat`; the proxy forwards it as `x-token-iat`, and the resolvers reject any token issued before `auth:revoke_before:<uid>` — a Redis key set on password change with a TTL equal to the token lifetime (one cached Redis read per request, fail-open on a Redis outage). **Rate limiting:** `lib/rate_limit.ts` is a fixed-window Redis limiter (fails open on Redis outage); login is capped at 10/min by IP and 5/5 min by username, signup at 5/hr by IP. **CSP:** `proxy.ts` injects a per-request nonce and sets Content-Security-Policy headers. **Every query must be scoped to `user_id`**; updates/deletes use composite `where: { id, user_id }`.
- **Pure domain logic** sits in `app/_utils/*` (e.g. `normalize_txn.ts`, `validate_line_items.ts`, `fifo.ts`, `xirr_calculator.js`, `value_timeseries.ts`) and is unit-tested. Keep the null-remainder normalization and invariant checks here, not in actions/components.
- **Decimals**: monetary/quantity columns are `Decimal(14,4)`; convert with `app/_utils/decimal.ts` (`toDecimal`), never plain JS floats.
- **Env** is validated through `lib/env.ts` (zod, `server-only`); import `env` from there rather than reading `process.env`. `lib/config.ts` holds `USER_TIMEZONE = 'Asia/Kolkata'` — all date handling is IST.
- **Prisma singleton** (`lib/prisma.ts`) is `$extends`-instrumented for profiling: it counts/times every query into the per-request `AsyncLocalStorage` context and publishes dev query events. Don't construct a second `PrismaClient`.

## Cross-user linked accounts & approvals

An `account`-type head can carry a `linked_user_id` pointing at another user. A transaction touching such a head is **shared**: each side keeps its own balanced copy, mirroring on the linked/reciprocal `account` head with **sign-flipped** `quantity`/`txn_value` (description/datetime copied verbatim), and each user chooses their own balancing lines. **Any transaction create/update/delete can therefore have approval side effects on a counterparty — account for that whenever you touch transaction write paths.**

- **State machine** is `transaction_link` (`prisma/schema.prisma`): `txn_a_id`/`txn_b_id` (either nullable — a side may delete its copy while the link lives), `pending_status` (`pending`|`approved`|`rejected`), `pending_kind` (`change`|`deletion`), and `pending_by`, which **always names whoever must act next** (null iff approved).
- **All link logic is in `app/_utils/links.ts`** (`server-only`; operates on a passed `$transaction` client — note the local `Tx` type, since `Prisma.TransactionClient` doesn't match our `$extends`-extended client). The write hooks: `create_transaction` → `create_links_for_transaction` (opens one pending `change` per counterparty); `update_transaction` (`_actions/transactions_update.ts`) → `sync_links_after_update` (re-opens only siblings whose **content signature** `linked_signature` — shared lines + txn description/datetime — actually changed; an **anchor hard-block** forbids editing shared lines while a request awaits _you_); `delete_transaction` → `prepare_links_for_delete` (approved links become `deletion` requests, the counterpart copy is the anchor); linking an account (`_actions/resources.ts`) → `backfill_links_for_account` (retroactive requests for existing txns).
- **Actions** in `app/_actions/approvals.ts`: `approve_request` / `reject_request` / revert / cancel / `accept_all_from`. Approving rebuilds the actor's copy via `build_actor_copy` — mirrored lines are locked/server-derived; the actor's own balancing lines are validated through `validate_line_items`. Every transition `invalidate_balances` on **both** users.
- **UI** is `app/requests/` — inbox (`get_inbox`, awaiting me) + outbox (`get_outbox`, awaiting them); `inbox_count` badges the nav. (A `// see docs/linked-accounts-plan.md` comment in `links.ts` points at a file not in the repo — ignore it.)

## Push notifications

Web Push (`web-push`) for the approval workflow. **VAPID keys are optional — when unset, sending is a silent no-op**, so dev and unconfigured prod run fine. `app/_utils/push.ts` `send_push_to_user` fans out to a user's `push_subscription` rows (keyed by `endpoint`), prunes ones the push service reports gone, and never throws. Domain wrappers in `app/_utils/notify_events.ts` (`notify_request_pending` / `notify_request_rejected`) are fired fire-and-forget from the approval/transaction actions. Client SW is `public/sw.js` (registered client-side); `/sw.js` and the manifest are whitelisted in `proxy.ts`. Env: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`, plus `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (inlined client-side at build). **`app/_actions/notifications.ts`** manages push subscription CRUD (`save_push_subscription`, `delete_push_subscription`) and exposes `send_test_notification` + `send_notification_to_user` — both rate-limited via `lib/rate_limit.ts`.

## Remote MCP server (Claude / ChatGPT / Gemini)

A standard **Model Context Protocol** server at `app/api/mcp/route.ts` lets external AI clients read and write the ledger as the user. Like the CLI, every tool calls the same `app/_core/*` functions (so validation, cross-user approval links, and balance invalidation are identical) — it's just another surface over the core. Built on **`mcp-handler`** (Streamable HTTP, SSE disabled); read tools carry `readOnlyHint: true`, write tools don't. The route splits across three files: `route.ts` (handler + the original read/transaction/approval tools), `_helpers.ts` (auth/formatting/resolution helpers shared by both), and `_extra_tools.ts` (`register_extra_tools` — heads/assets/templates/settings/attachments/reconciliation/approval-extras).

- **Tools**: read — `get_net_worth`, `get_holdings`, `get_balances` (optional `head` + `as_of` closing balance), `get_asset`, `get_head`, `get_income_expense`, `list_transactions` (search/date/`head`/`asset`/`external_ref` filters, `offset`, per-head `head_delta`), `find_similar_transactions`, `get_transaction` (incl. attachments + approval links), `list_heads`, `list_assets`, `list_requests`, `list_templates`, `get_settings`, `find_user`, `find_by_external_ref`, `reconcile` (statement rows vs one account; pure matcher in `app/_utils/reconcile.ts`), `validate_my_transactions`, `get_attachment` (inline text/JSON + image blocks); write — `create_transaction`, `create_transactions` (≤50, all-or-nothing), `update_transaction` (line_items optional — omitted keeps them), `delete_transaction` (returns a re-creatable snapshot), `pay`, `approve_request` / `reject_request` / `cancel_request` / `revert_request` / `accept_all_from`, `create_head` / `update_head` (incl. `is_active` archive, cross-user linking, `lock_date`/`clear_lock_date`) / `delete_head`, `create_asset` / `update_asset` / `delete_asset` / `reorder_siblings` (asset scope + asset CRUD are **admin-gated** via `user.is_admin`, mirroring the web), `create_template` / `update_template` / `delete_template`, `add_attachment` / `delete_attachment`, `update_settings`. **Write parity with the web UI is a goal — if a page can do it, MCP should too** (auth/password changes are deliberately excluded).
- **Agent-safety contract** (born from real agent feedback): `create_transaction`/`create_transactions` accept per-line `external_ref` (bank/UPI ref on `line_item` — line items are the actual bank rows; a top-level `external_ref` is a convenience that stamps the single account line) and `idempotency_key` (unique per user — replaying returns the existing txn instead of double-posting; race-safe via the DB constraint); a **near-duplicate guard** (same account, same net flow, ±36h) rejects creates with the matching id unless `force: true`; `dry_run: true` validates and echoes the server-derived remainder lines without writing; every mutating transaction tool returns the **post-write balances** of the touched accounts; deletes return the full deleted snapshot. Dates accept dd-MM-yyyy **or** yyyy-MM-dd everywhere (`parse_day`); `get_head`/`get_asset` line items paginate (`line_items_limit`/`_offset`, `from`/`to`).
- The read tools aim for **parity with the web UI** — every page's computed values (asset/head detail incl. XIRR + FIFO cost basis, period income/expense, hierarchical list values) are reachable; heavy compute and large payloads sit behind opt-in flags (`include_line_items` / `include_timeseries` / `include_values`). The handler also ships server-level **`instructions`** telling the connected model to consult the user's transaction history (via `find_similar_transactions`) and reuse their existing heads before creating/updating rather than re-asking for every detail. Head/asset args accept an id **or** a name (exact case-insensitive, then unique-substring; a failed match returns the valid names, an ambiguous one lists the candidates); the authenticated `user_id` comes from `extra.authInfo.extra.userId`. Note `get_head`/`list_*` reimplement a couple of page rollups on `compute_balances_core(uid)` because the page versions resolve the user from request context, which MCP bearer auth doesn't populate.
- **Auth is self-hosted OAuth 2.1 + PKCE** (clients like Claude's web/mobile connectors only support OAuth, not static bearer headers). All token logic is in **`lib/mcp/oauth.ts`** (`server-only`): clients self-register via DCR, codes/tokens are stored **sha256-hashed** (`mcp_oauth_client` / `mcp_oauth_code` / `mcp_access_token` in `prisma/schema.prisma`), access tokens last 1h with 90-day rotating refresh tokens. **No new env** — tokens are opaque random, not JWTs.
- **Endpoints**: discovery at `app/.well-known/oauth-{authorization-server,protected-resource}/route.ts` (RFC 8414/9728); `app/api/oauth/{register,authorize,token}/route.ts`. `authorize` is the only browser-facing one — it reuses the normal `ledger_token` login cookie (bouncing to `/login?next=` when absent — see `safe_next` in `app/login/ClientPage.tsx`) and renders a CSRF-protected consent page. **All of `/.well-known/*`, `/api/oauth/*`, and `/api/mcp` are whitelisted in `proxy.ts`** (they do their own bearer/cookie auth).
- Connecting a client: add `https://<host>/api/mcp` as a custom connector; it auto-discovers the flow via the 401 `WWW-Authenticate` on `/api/mcp`.

## Statement reconciliation & agent-safety features (web + MCP)

The `/reconcile` page and the MCP `reconcile` tool share **`app/_core/reconcile_core.ts`** (`reconcile_ledger_core`) over the pure, unit-tested matcher `app/_utils/reconcile.ts`. Matching is **per account line item, not per transaction** — line items are the atomic flows (`line_item.external_ref` carries the bank ref), so one transaction netting several bank events still reconciles row-by-row, with per-line `datetime` overrides honored; the page's paste/CSV input goes through the pure parser `app/_utils/statement_parser.ts` (headers or positional columns, debit/credit, ₹/Cr/Dr, several date formats) and books missing rows via `create_transactions_core` with `external_ref` + deterministic `idempotency_key` per row. Historical closing balances come from **`closing_balance_core`** (`balances_core.ts` — any head type, book value, IST end-of-day), surfaced as `get_balances as_of` (MCP), the `AsOfBalance` card on account/allocation head pages, and the reconcile page. The near-duplicate guard **`find_possible_duplicate`** lives in `transactions_core.ts` and backs both the MCP guard and the create form's amber warning (`transactions/create/check_duplicate.ts`). Other web wiring from the same pass: `external_ref` ("Reference") field on create/update forms + detail chip + list `ref` filter, delete-undo (`delete_transaction_with_snapshot` → sessionStorage `ledger_undo_delete` → toast on the transactions list; attachments are not restored), user-scoped `settings/validate_my_txns.ts` (ValidationSection), and client-side "Show more" pagination of line items on head/asset detail pages.

**Reconciliation lock**: `accounting_head.lock_date` (account type only, nullable) freezes verified history — every write whose line items would touch that account on/before the lock's IST day is rejected (`app/_utils/lock_date.ts`, `assert_no_locked_lines`, unit-tested). Enforced in all four `transactions_core` write paths **and** the approval bypass (`build_actor_copy` in `links.ts`, deletion approvals in `approvals_core.ts`) — an incoming approval into your locked period errors until you move the lock back. Set/cleared per account on the head edit page, via `update_account_core`'s trailing `lock_date` param (`Date | null | undefined` = set/clear/keep), or MCP `update_head`; `get_head`/`list_heads` expose it. Workflow: verify an account against the bank (reconcile page / `get_balances as_of`), then advance its lock.

## Data export & dumps

Four download routes share collectors in `app/_utils/db_export.ts` and pure, unit-tested builders in `app/_utils/{csv,zip,xlsx,sql_dump}.ts` (ZIP and `.xlsx` OOXML are hand-rolled — no new deps). Table names and `WHERE` clauses are **static literals**; the lone bound param is the user id (no injection surface) — keep it that way if you extend `USER_TABLES`/`FOREIGN_KEYS`. `collect_user_export(user_id, excluded?)` is caller-scoped (and pulls referenced `asset` catalog rows even though `asset` has no `user_id`); `collect_full_dump()` walks every base table. Routes: `/api/export` (CSV-per-table ZIP) and `/api/export/xlsx` (one linked workbook, FK cells hyperlinked) both drop `password_hash` via `DEFAULT_EXCLUDED_COLUMNS`; `/api/dump` is the **caller-scoped** SQL dump (keeps every column so it restores); `/api/admin/dump` is the whole-DB SQL dump behind `require_admin` (`app/_actions/auth.ts`, backed by `user.is_admin`). Surfaced in `app/settings/` (`DataSection.tsx`, plus admin-only `AdminSection.tsx`). Note `/api/dump` used to be unscoped — it leaked all users' rows and hashes; don't reintroduce an unscoped data route.

## Profiling & dev tooling

Pages are wrapped with `profile()` (`lib/metrics/`); metrics land in `server_metric`/`slow_query`/`web_vital` (fire-and-forget). Disable with `PROFILING=off`. In dev, a query toaster surfaces each DB/Redis op via SSE at `/api/dev/queries`; silence with `DEV_QUERY_TOASTS=off`.

## Code style

Prettier: no semicolons, single quotes, `arrowParens: avoid`, `printWidth: 150`. Node 24 (`.nvmrc`). `@/*` maps to repo root.
