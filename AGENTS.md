# AGENTS.md — Ledger

Triple-entry bookkeeping app. Next.js 16 App Router, React 19, Prisma 7 (Postgres/Neon), Redis, Vercel Blob.

## Commands

- **Package manager**: `pnpm@11.1.2` only. Never `npm`/`npx`. Always `pnpm <script>` / `pnpm exec <bin>` / `pnpm dlx <pkg>`.
- `pnpm dev` / `pnpm build` (runs `prisma generate` first) / `pnpm start`
- `pnpm typecheck` / `pnpm lint` / `pnpm format` / `pnpm format:check`
- `pnpm test` — vitest (colocated `*.test.ts`). Single file: `pnpm test -- normalize_txn`
- `pnpm test:watch` / `pnpm analyze` (bundle analyzer, `ANALYZE=true`)
- `pnpm dlx tsx scripts/seed_sample_user.ts` (user `rahul`/`rahul1234`) — idempotent, deterministic PRNG, reads `DATABASE_URL`
- **Local stack**: `docker compose up -d postgres redis blob` then `docker compose run --rm sync-db`

## CI gate (run before pushing)

Order: `prisma generate` → `pnpm typecheck` → `pnpm lint` → `pnpm test` → `prettier --check`.  
CI has no real DB — a placeholder `DATABASE_URL` in the workflow's `env` block satisfies `prisma.config.ts`.

## Prisma quirks

- **Generated client**: `generated/prisma` (not `node_modules`). Import from `@/generated/prisma/client` and `@/generated/prisma/enums`.
- **Migrations**: never hand-write — `pnpm exec prisma migrate dev --name <name>`. Prod: strip `-pooler` from Neon host before `prisma migrate deploy`.
- **Singleton**: `lib/prisma.ts` — `$extends`-instrumented for profiling. Don't create a second `PrismaClient`.

## Architecture

- **Server-wrapper pattern**: `page.tsx` (server component, data fetching only) → `ClientPage.tsx` (UI/state). Pages wrapped with `profile('/path', Page)` from `lib/metrics/`.
- **Server actions**: shared ones in `app/_actions/*`, per-page ones colocated in route folder. Return `ActionResult<T>` (`ok(data, msg)` / `err(code, msg)`). Use `fromError` in catch blocks (maps Prisma P2002/P2003/P2025); throw `ActionError` inside `$transaction` callbacks to abort.
- **User scoping**: `proxy.ts` (Next 16 middleware — note the filename) verifies JWT cookie, stamps `x-user-id`/`x-username`/`x-token-iat` headers. Actions call `get_current_user_id()` / `get_current_user()` from `_actions/auth.ts`. **Every query must be scoped to `user_id`**; updates/deletes use composite `where: { id, user_id }`.
- **Env validation**: `lib/env.ts` (zod, `server-only`). Never read `process.env` directly.
- **Decimals**: `Decimal(14,4)` columns. Use `toDecimal()` from `app/_utils/decimal.ts`. No plain JS floats.
- **Timezone**: `Asia/Kolkata` (IST) — all date handling.
- **Domain logic**: in `app/_utils/*`, unit-tested. Keep null-remainder normalization and invariant checks here, not in actions/components.
- **Pre-commit**: simple-git-hooks + lint-staged (prettier + eslint on staged files).

## Storage model (read README before touching transaction/balance code)

The null-remainder pattern: `account` line items always have explicit `quantity`/`txn_value`; `allocation`/`income_expense` groups each get exactly one `null` entry (auto-derived by `normalize_txn` at read time). Classic invariant after normalization: sum(quantity) is equal across all three sides.

## Cross-user linked accounts / approvals

Any transaction create/update/delete on an `account`-type head with `linked_user_id` has side effects on a counterparty. State machine: `transaction_link` (`pending`/`approved`/`rejected`, `change`/`deletion`, `pending_by`). All link logic in `app/_utils/links.ts` (operates on a `$transaction` client). Approval actions in `app/_actions/approvals.ts`. Every transition invalidates balances on **both** users.

## Push notifications

Web Push (`web-push`, `app/_utils/push.ts`). **VAPID keys are optional** — when unset, sending is a silent no-op. Fire-and-forget from `app/_utils/notify_events.ts`.

## Transaction templates

`transaction_template` + `line_item_template` models for reusable transaction patterns. CRUD in `app/_actions/templates.ts`.

## Data export

Routes in `app/api/export/` and `app/api/dump/` — must always be user-scoped. `/api/dump` was historically unscoped (leaked all users' rows); don't reintroduce.

## Profiling & dev tooling

- `profile()` wrapper on pages (`lib/metrics/`). Disable with `PROFILING=off`.
- Dev query toaster (SSE at `/api/dev/queries`). Silence with `DEV_QUERY_TOASTS=off`.

## Code style

Prettier: no semicolons, single quotes, `arrowParens: avoid`, `printWidth: 150`. Node 24 (`.nvmrc`). `@/*` → repo root. All DB names `snake_case` (tables, columns, by convention functions/actions too).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
