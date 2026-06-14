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
- The README's schema block predates `transaction_link`, `push_subscription`, and the `pending_status` / `pending_kind` enums — `prisma/schema.prisma` is the current shape.

## Architecture conventions

- **Server-wrapper pattern**: each route is `page.tsx` (server component, data fetching only) delegating to `ClientPage.tsx` (all UI/state/effects). Follow this when adding routes.
- **Server actions** live in `app/_actions/*` (`'use server'`) when shared across routes; an action used by exactly one page is colocated in that route folder instead (e.g. `transactions/[id]/update/transactions_update.ts`, `settings/flush.ts`, `settings/validate_all_txns.ts`). They return the discriminated `ActionResult<T>` from `_result.ts` — `ok(data, msg)` / `err(code, msg)`; use `fromError` in catch blocks (it maps Prisma P2002/P2003/P2025). Don't throw across the action boundary except for admin guards. Inside a `$transaction` callback, throw `ActionError(code, msg)` to abort the tx — the surrounding try catches it and `fromError` preserves the code. Log failures via `logger` (`lib/logger.ts`, pino) before returning.
- **Auth & user scoping**: `proxy.ts` (Next 16's middleware equivalent — note the filename) verifies the JWT cookie and stamps a trusted `x-user-id` header, stripping any client-supplied value first. In actions, get the caller via `get_current_user_id()` / `get_current_user()` from `_actions/auth.ts` (both `react.cache`-wrapped, header-first to avoid a DB hit). **Session revocation:** tokens carry an `iat`; the proxy forwards it as `x-token-iat`, and the resolvers reject any token issued before `auth:revoke_before:<uid>` — a Redis key set on password change with a TTL equal to the token lifetime (one cached Redis read per request, fail-open on a Redis outage). **Every query must be scoped to `user_id`**; updates/deletes use composite `where: { id, user_id }`.
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

Web Push (`web-push`) for the approval workflow. **VAPID keys are optional — when unset, sending is a silent no-op**, so dev and unconfigured prod run fine. `app/_utils/push.ts` `send_push_to_user` fans out to a user's `push_subscription` rows (keyed by `endpoint`), prunes ones the push service reports gone, and never throws. Domain wrappers in `app/_utils/notify_events.ts` (`notify_request_pending` / `notify_request_rejected`) are fired fire-and-forget from the approval/transaction actions. Client SW is `public/sw.js` (registered client-side); `/sw.js` and the manifest are whitelisted in `proxy.ts`. Env: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`, plus `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (inlined client-side at build).

## Data export & dumps

Four download routes share collectors in `app/_utils/db_export.ts` and pure, unit-tested builders in `app/_utils/{csv,zip,xlsx,sql_dump}.ts` (ZIP and `.xlsx` OOXML are hand-rolled — no new deps). Table names and `WHERE` clauses are **static literals**; the lone bound param is the user id (no injection surface) — keep it that way if you extend `USER_TABLES`/`FOREIGN_KEYS`. `collect_user_export(user_id, excluded?)` is caller-scoped (and pulls referenced `asset` catalog rows even though `asset` has no `user_id`); `collect_full_dump()` walks every base table. Routes: `/api/export` (CSV-per-table ZIP) and `/api/export/xlsx` (one linked workbook, FK cells hyperlinked) both drop `password_hash` via `DEFAULT_EXCLUDED_COLUMNS`; `/api/dump` is the **caller-scoped** SQL dump (keeps every column so it restores); `/api/admin/dump` is the whole-DB SQL dump behind `require_admin` (`app/_actions/auth.ts`, backed by `user.is_admin`). Surfaced in `app/settings/` (`DataSection.tsx`, plus admin-only `AdminSection.tsx`). Note `/api/dump` used to be unscoped — it leaked all users' rows and hashes; don't reintroduce an unscoped data route.

## Profiling & dev tooling

Pages are wrapped with `profile()` (`lib/metrics/`); metrics land in `server_metric`/`slow_query`/`web_vital` (fire-and-forget). Disable with `PROFILING=off`. In dev, a query toaster surfaces each DB/Redis op via SSE at `/api/dev/queries`; silence with `DEV_QUERY_TOASTS=off`.

## Code style

Prettier: no semicolons, single quotes, `arrowParens: avoid`, `printWidth: 150`. Node 24 (`.nvmrc`). `@/*` maps to repo root.
