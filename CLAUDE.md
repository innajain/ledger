# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal-finance app built on a **triple-entry bookkeeping** model (Next.js 16 App Router, React 19, Prisma 7, Postgres/Neon, Redis, Vercel Blob). `README.md` is the canonical reference for the domain model — the null-remainder storage scheme, transaction invariants, XIRR, caching keys, cron jobs, and the local/prod sync stack. Read it before touching transaction, balance, or pricing code. This file covers commands, conventions, and the wiring that spans multiple files.

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

## Architecture conventions

- **Server-wrapper pattern**: each route is `page.tsx` (server component, data fetching only) delegating to `ClientPage.tsx` (all UI/state/effects). Follow this when adding routes.
- **Server actions** live in `app/_actions/*` (`'use server'`). They return the discriminated `ActionResult<T>` from `_result.ts` — `ok(data, msg)` / `err(code, msg)`; use `fromError` in catch blocks (it maps Prisma P2002/P2003/P2025). Don't throw across the action boundary except for admin guards.
- **Auth & user scoping**: `proxy.ts` (Next 16's middleware equivalent — note the filename) verifies the JWT cookie and stamps a trusted `x-user-id` header, stripping any client-supplied value first. In actions, get the caller via `get_current_user_id()` / `get_current_user()` from `_actions/auth.ts` (both `react.cache`-wrapped, header-first to avoid a DB hit). **Every query must be scoped to `user_id`**; updates/deletes use composite `where: { id, user_id }`.
- **Pure domain logic** sits in `app/_utils/*` (e.g. `normalize_txn.ts`, `validate_line_items.ts`, `fifo.ts`, `xirr_calculator.js`, `value_timeseries.ts`) and is unit-tested. Keep the null-remainder normalization and invariant checks here, not in actions/components.
- **Decimals**: monetary/quantity columns are `Decimal(14,4)`; convert with `app/_utils/decimal.ts` (`toDecimal`), never plain JS floats.
- **Env** is validated through `lib/env.ts` (zod, `server-only`); import `env` from there rather than reading `process.env`. `lib/config.ts` holds `USER_TIMEZONE = 'Asia/Kolkata'` — all date handling is IST.
- **Prisma singleton** (`lib/prisma.ts`) is `$extends`-instrumented for profiling: it counts/times every query into the per-request `AsyncLocalStorage` context and publishes dev query events. Don't construct a second `PrismaClient`.

## Profiling & dev tooling

Pages are wrapped with `profile()` (`lib/metrics/`); metrics land in `server_metric`/`slow_query`/`web_vital` (fire-and-forget). Disable with `PROFILING=off`. In dev, a query toaster surfaces each DB/Redis op via SSE at `/api/dev/queries`; silence with `DEV_QUERY_TOASTS=off`.

## Code style

Prettier: no semicolons, single quotes, `arrowParens: avoid`, `printWidth: 150`. Node 24 (`.nvmrc`). `@/*` maps to repo root.
