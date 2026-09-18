---
name: run-app
description: Launch and drive this ledger app locally — Postgres and Redis without a Docker daemon, seeded data, production build, and a Playwright login flow for screenshots. Use when asked to run, start, or screenshot the app, or to confirm a change works in the real UI rather than only in tests.
---

# Running the ledger app

Verified cold on a fresh Linux container (root, no Docker daemon, outbound
network proxied). Steps are ordered; each one's command is the one that
worked, not a paraphrase.

`docker compose up -d postgres redis blob` from CLAUDE.md is the documented
path and is still right on a workstation. It does **not** work in the web /
remote container: `docker` is on PATH but no daemon is running. Everything
below replaces it.

## 1. Postgres

`initdb` refuses to run as root, and the `postgres` user cannot traverse into
the session scratchpad (`/tmp/claude-*` is root-only, and `chmod` on it does
not stick). Put the cluster under the postgres user's own home instead:

```bash
PGD=/var/lib/postgresql/ledgerdemo
mkdir -p $PGD && chown -R postgres:postgres $PGD
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGD -U postgres --auth=trust"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGD -l /var/lib/postgresql/pg.log -o '-p 5432 -k /tmp' start"
psql -h 127.0.0.1 -U postgres -c "create database appdb"
```

Postgres 16 here vs. 17 in `docker-compose.yml`; nothing in the schema cares.

## 2. Redis

```bash
redis-server --port 6379 --daemonize yes --save ''
redis-cli ping   # PONG
```

## 3. Env

`example.env` carries placeholder Sentry/VAPID/blob values that are not needed
to boot. The minimum `lib/env.ts` accepts:

```bash
cat > .env <<'EOF'
JWT_SECRET=local_dev_secret
DATABASE_URL=postgresql://postgres@127.0.0.1:5432/appdb
REDIS_URL=redis://127.0.0.1:6379
PROFILING=off
DEV_QUERY_TOASTS=off
EOF
```

`.env` is gitignored. Leave VAPID unset — push sending is a silent no-op.

## 4. Schema and seed

```bash
pnpm exec prisma migrate deploy
pnpm dlx tsx scripts/seed_sample_user.ts   # user rahul / rahul1234
```

`prisma generate` is also what makes `pnpm test` pass — without it 9 test files
fail on `@/generated/prisma/client`, which looks like a broken suite and is not.

## 5. Extra fixture data

Two things bite when writing a throwaway seeder:

- **Put the script in the repo root**, not the scratchpad. Node resolves
  `@prisma/adapter-pg` relative to the script's directory, and the scratchpad
  has no `node_modules`. Delete it afterwards.
- **Build the client the way `scripts/*.ts` do** — Prisma 7 has no implicit
  connection:

  ```ts
  import { PrismaClient } from './generated/prisma/client'
  import { PrismaPg } from '@prisma/adapter-pg'
  import 'dotenv/config'
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
  ```

- **Respect the null-remainder scheme.** Only the `account` leg carries a
  number; the income/expense and allocation legs are `quantity: null` and are
  derived. Writing explicit values on every leg inserts fine and then throws
  `Income/expense group with no null quantity line item` out of
  `normalize_line_items` at render time — a 500 on the page, not a seed error.

## 6. Serve it — production build, not `pnpm dev`

```bash
pnpm build && pnpm start   # http://127.0.0.1:3000
```

`pnpm dev` serves pages but the client never hydrates in this container: form
inputs fill, React state stays empty, and the login button stays `disabled`
forever. No console error, no failed request, so it reads as a selector
problem. The production build is fine, and is the more faithful target anyway.

Restarting after a code change: kill the server by PID. `pkill -f next-server`
matches the shell running that very command, so it kills the caller — the tool
call dies with exit 144 and the build never starts.

## 7. Drive it

Playwright is installed globally, not in the repo, and Chromium is
pre-installed — never run `playwright install`.

```js
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
// /opt/pw-browsers/chromium-*/chrome-linux/chrome — glob it, the build number moves.
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2 })

await page.goto('http://127.0.0.1:3000/login', { waitUntil: 'load' })
await page.waitForTimeout(2000) // hydration; the submit button is disabled until React has the values
await page.locator('input#username').fill('rahul')
await page.locator('input#password').fill('rahul1234')
await page.locator('button[type=submit]').click()
await page.waitForURL('http://127.0.0.1:3000/', { timeout: 60000 })
```

Pass `colorScheme: 'dark'` to `newPage` for the dark-mode shot — the app
follows the media query, there is no in-app toggle to click.

Amounts render masked (dot placeholders) on a fresh session; click the
`MaskedAmount` control if a figure needs to be legible in the screenshot.

## 8. Expected noise — not regressions

- `Error fetching latest price` (Yahoo) and `AMFI NAV fetch failed: 403`:
  outbound price feeds are blocked. Net worth, allocations and the trend chart
  read ₹0 as a result. Nothing is broken.
- `webpack-hmr` WebSocket failures in `pnpm dev`.

## 9. Leave the tree clean

`.env` is gitignored, but any seeder or Playwright script parked in the repo
root is not. Delete them and check `git status` before committing.
