# Feature plan: Future transactions

Target audience for this doc: an implementer (human or LLM) with no prior context on this
conversation. It assumes familiarity with the repo's own `CLAUDE.md` (read that first —
server-wrapper pattern, `ActionResult`, `app/_core` vs `app/_actions` vs `app/_utils`, Decimal
handling, Prisma conventions) but explains everything specific to this feature.

## 1. What this feature is

A "future transaction" has the exact same shape as a normal transaction (same `transaction` +
`line_item` rows, same validation, same attachments) but is marked with a new boolean flag,
`is_future`. While `is_future = true`:

- It must **never appear** on the `/transactions` list page.
- It must **never be counted** in any balance, net worth, XIRR, FIFO, income/expense, or
  value-timeseries computation.
- It **can** be edited (line items, description, datetime) like a normal transaction.
- It **can** be converted to a real transaction (flip `is_future` to `false`), at which point it
  starts counting everywhere, exactly as if it had been created normally at that moment.
- Each account-type head's detail page gets a new "Future transactions" section listing that
  head's future transactions and flagging whether the account will have enough balance when each
  one lands (see §6 for the exact algorithm).

**Important scope clarification:** `is_future` is an independent flag, not derived from
`datetime`. A normal (non-future) transaction dated tomorrow already posts to balances
immediately today — that existing behavior is unchanged. Only transactions explicitly created/
marked as future are excluded. Don't try to infer "future-ness" from `datetime > now()`.

**Cross-user linked/shared accounts — allowed, but the mirror/approval is deferred:** an
`account`-type head can have `linked_user_id` set, making any transaction that touches it
"shared" — the app normally creates a mirrored, sign-flipped copy on the counterparty's ledger
that they must approve (`app/_utils/links.ts`, the `transaction_link` state machine). A future
transaction is allowed to touch a linked account, but while it stays future, **no mirror/approval
is created at all** — it's a private draft the counterparty never sees. The mirror gets created
the moment it becomes real (convert-to-real, or a direct real→real create), at which point it
behaves exactly like any other fresh transaction on a shared account: a pending request opens for
the counterparty then, not before. See §4 for exactly where to skip vs. call the existing link
functions.

The one direction that genuinely has no clean semantics, and is the only thing actually blocked:
**demoting an already-real, already-linked transaction back to future.** If a transaction already
has `transaction_link` rows (the counterparty may have an approved copy of it), flipping it to
future would have to somehow retract or orphan that copy — not attempted in v1. Reject that one
transition with a clear validation error; every other combination (create future on a linked
account, edit a future transaction that touches a linked account, convert future→real on a linked
account) is allowed.

**Out of scope for v1 (explicitly deferred, call this out if asked to expand later):**

- Reconciliation lock (`accounting_head.lock_date`) does not apply while a transaction stays
  future (it has no balance effect yet), but **does** apply the moment it becomes real (on
  create-as-real, on update that keeps it real, and on conversion to real). See §4.
- No push notifications while a transaction stays future — `notify_request_pending` only fires
  once a shared future transaction becomes real and its mirror is actually created, matching
  normal create/update behavior.
- No caching of the "future transactions for this head" list — compute it fresh per page load
  (it's a small, indexed, per-user/per-head query; no need for the Redis balance-cache treatment
  that `compute_balances_core` gets).

## 2. Data model change

Add one column to `transaction` in `prisma/schema.prisma`:

```prisma
model transaction {
  id          String   @id @default(cuid())
  user_id     String
  datetime    DateTime
  description String?
  is_future   Boolean  @default(false)   // <-- new

  idempotency_key String?

  user        user                     @relation(fields: [user_id], references: [id])
  line_items  line_item[]
  attachments transaction_attachment[]
  txn_a_links transaction_link[]       @relation("txn_a_links")
  txn_b_links transaction_link[]       @relation("txn_b_links")

  @@unique([user_id, idempotency_key])
  @@index([user_id, datetime])
  @@index([user_id, is_future, datetime])   // <-- new, serves the future-list + list-page-exclusion queries
  @@index([description(ops: raw("gin_trgm_ops"))], type: Gin)
}
```

Generate the migration with the real tool, don't hand-write it:

```bash
pnpm exec prisma migrate dev --name add_future_transactions
```

No other schema changes needed. `line_item` is untouched — "structure should be same as normal
txn" is satisfied by future transactions being ordinary `transaction` rows with the new flag.

`app/_utils/db_export.ts` (CSV/xlsx/SQL-dump export) selects columns by `SELECT *` per table, not
an explicit column list — confirmed by reading it — so the new column is picked up automatically.
No change needed there.

## 3. Central "not future" filter — audit list

`compute_balances_core` and friends currently sum **every** transaction row for the user with no
date or status filter — that's the whole "current balance" model in this app (it's not time-
bounded; every posted transaction counts immediately, forever). Adding `is_future` support means
adding `is_future: false` to every query that feeds a balance/value/list computation, and
guaranteeing it wasn't missed anywhere.

Add one small shared constant to avoid typos, e.g. in `app/_utils/normalize_txn.ts` or a new tiny
file `app/_utils/future_txn.ts`:

```ts
import type { Prisma } from '@/generated/prisma/client'

export const NOT_FUTURE: Prisma.transactionWhereInput = { is_future: false }
```

Merge it into every `where` below with `...NOT_FUTURE` (or `is_future: false` inline — either is
fine, but be consistent within a file). **Every file in this list was confirmed by grepping the
repo for `transaction.findMany|findFirst|findUnique|count|aggregate|groupBy` — do this grep again
before finishing, to catch anything added since this plan was written:**

```bash
grep -rln "transaction\.findMany\|transaction\.findFirst\|transaction\.findUnique\|transaction\.count\|transaction\.aggregate\|transaction\.groupBy" app lib | grep -v '\.test\.ts'
```

Per-file treatment:

1. **`app/_core/balances_core.ts`**
   - `compute_balances_core`: add `is_future: false` to the `where` of the `rawTransactions`
     query (around line 41-55). This is the single most important change — it's the source of
     truth for every account/allocation/income-expense balance in the app (net worth, home page,
     head pages all read through this, directly or via its Redis cache).
   - `closing_balance_core`: add `is_future: false` to the `where` of its `txns` query (around
     line 135-157). Historical closing balances must never include a future transaction even if
     its `datetime` happens to be before the cutoff.

2. **`app/_core/valuation_core.ts`** — `fetch_subtree_cashflows` (used for XIRR net worth
   cashflows) queries `prisma.transaction.findMany` directly (around line 60). Add
   `is_future: false`. `compute_net_worth` itself calls `compute_balances_core`, so it's covered
   transitively once (1) is fixed — verify by reading the function, don't just assume.

3. **`app/heads/[type]/[id]/page.tsx`** — the main query (around line 64) that feeds:
   current total (`acc_total`), the per-asset `breakdown`, XIRR `cashflows`, FIFO
   `remaining_quantity`, and `value_timeseries`. Add `is_future: false` to its `where`. Then add a
   **separate** query for that head's future transactions (see §6) — don't reuse the same query
   for both purposes, they have different shapes and different consumers.

4. **`app/assets/[id]/page.tsx`** — same pattern as (3) but keyed by `asset_id` instead of
   `accounting_head_id` (around line 40-41). Add `is_future: false`. Future transactions
   involving this asset should not appear in its holdings/FIFO/value math either — decide whether
   the asset detail page also needs a "future" section; the user's ask was specifically about
   _head_ pages, so this can stay a plain exclusion with no new UI unless asked.

5. **`app/transactions/page.tsx`** — the list page. **This is the one the user explicitly called
   out as "should not show."** Both query paths need the filter:
   - The `where: Prisma.transactionWhereInput` built around line 106 — add `is_future: false`.
   - The raw-SQL "needsScan" branch (amount filter/sort, around line 204-244) — add
     `t.is_future = false` to the `conds` array (it's built as `Prisma.Sql[]`, same pattern as the
     other conditions there).
   - Do **not** add a UI filter/toggle to show future transactions on this page for v1 — they
     live only on head pages and their own detail/edit page (reachable by direct link, e.g. from
     the head page's future section).

6. **`app/_components/HomeNetWorthTrend.tsx`** — both `prisma.transaction.findMany` calls (around
   line 45 and 49) feed the home page net worth chart. Add `is_future: false` to both `where`
   clauses.

7. **`app/page.tsx`** (home page) — two queries need it:
   - `month_txns` (around line 86-93, income/expense summary for the month).
   - `recent_txns` (around line 94-99, the "recent transactions" list shown on the home page).
     Both need `is_future: false` added to their `where`.

8. **`app/settings/validate_all_txns.ts`** and **`app/settings/validate_my_txns.ts`** — these
   validate stored invariants (line-item balancing, etc.), not balances. Decide to **include**
   future transactions in structural validation (they should still be internally valid
   transactions), so **no filter needed** here — but read both files to confirm they don't also
   feed anything balance-related. If either surfaces a "total" or similar derived number to the
   user, reconsider.

9. **`app/_utils/fetch_transactions.ts`** (`fetch_and_normalize_transactions`) — this takes a list
   of `line_item.transaction_id`s the _caller_ already selected and just resolves them; it doesn't
   independently decide what counts. **No filter needed inside this file** — instead, audit every
   caller to confirm the line-item ids they pass in were themselves drawn from an already-
   future-filtered query (e.g. FIFO cost-basis lookups on the asset/head pages, once (3) and (4)
   are fixed, will only ever pass ids belonging to non-future transactions). Grep its call sites
   (`grep -rn "fetch_and_normalize_transactions" app`) and check each one.

10. **`app/api/mcp/route.ts`** and **`app/api/mcp/_extra_tools.ts`** — see §7 (MCP parity). Tools
    that reimplement rollups on top of `compute_balances_core` are covered transitively; tools
    that run their own `prisma.transaction.findMany` (notably `list_transactions`,
    `find_similar_transactions`, `get_transaction`) need explicit handling.

11. **`app/_core/approvals_core.ts`** — reads/writes transactions as part of the cross-user
    approval flow. No changes needed here: this file only ever operates on transactions that
    already have a `transaction_link` row, and per §1/§4 a transaction only gets a link once it's
    real (link creation is deferred while `is_future` is true). So this file can never see a
    future transaction — confirm that during implementation rather than assuming it.

## 4. Write-path changes (`app/_core/transactions_core.ts`)

This is the file with `create_transaction_core`, `create_transactions_core`,
`update_transaction_core`, `delete_transaction_core`, `create_upi_payment_core`,
`find_possible_duplicate`. Changes:

### 4.1 `create_transaction_core` / `create_transaction_in_tx`

- Add `is_future?: boolean` to `CreateTransactionOpts` (default `false` when absent — every
  existing caller that doesn't pass it keeps creating real transactions, unchanged).
- Add `is_future: z.boolean().optional()` to `createTransactionSchema`, threaded through to the
  `tx.transaction.create({ data: { ..., is_future: parsed.data.is_future ?? false } })` call.
- **Lock-date guard:** `assert_no_locked_lines` should only run when the transaction is **not**
  future. Wrap the existing call: `if (!is_future) assert_no_locked_lines(...)`. A future
  transaction dated in a locked period is fine — it doesn't touch the balance yet; the lock check
  re-applies when it's converted (§4.4).
- **Link creation:** skip `create_links_for_transaction` entirely when `is_future` is true — a
  future transaction is a private draft even if it touches a linked account; the mirror/pending
  request is created later, when it becomes real (§4.3/§4.4). This is the only special handling
  needed for linked accounts on create — no validation rejection.
- **Balance invalidation:** in `create_transaction_core`, skip the `invalidate_balances` call
  when `is_future` is true — nothing changed that affects balances.
- **Notifications:** skip `notify_request_pending` when future (no links were created yet, so
  there's no counterparty to notify).

### 4.2 `create_transactions_core` (bulk)

Same treatment, applied per-item: add `is_future?: boolean` to `BulkTransactionInput`, thread
through `createTransactionSchema`, and skip link creation the same way inside
`create_transaction_in_tx` (shared with the single-create path, so this should fall out for free
if `create_transaction_in_tx` is the one place that owns this — keep it that way, don't duplicate
the check in the bulk wrapper). Only invalidate balances for the subset of `created` items that
are **not** future, and only collect counterparties to notify from the non-future ones.

### 4.3 `update_transaction_core`

- Add `is_future?: boolean | undefined` parameter, following the existing convention used for
  `datetime`/`description` (`undefined` = don't change; an explicit value = set it).
- Determine the **effective** future-ness as `const will_be_future = is_future !== undefined ?
is_future : existing.is_future` (you'll need to select `is_future` in the `existing` fetch).
- **Real→future guard (the one actual restriction):** if `will_be_future` is `true` and
  `existing.is_future` is `false` (i.e. this update is demoting an already-real transaction to
  future), check whether it currently has any `transaction_link` rows: `prisma.transaction_link
.findFirst({ where: { OR: [{ txn_a_id: id }, { txn_b_id: id }] } })`. If one exists, reject with
  `ActionError('VALIDATION', "Can't mark a transaction that's already shared with a linked user as future")`.
  If none exists, the demotion is allowed (nothing to retract). Every other transition — future
  stays future, future→real, real stays real, even when linked accounts are involved — proceeds
  normally with no linked-account check at all.
- Apply the same lock-date guard rule as create: only call `assert_no_locked_lines` when
  `will_be_future` is `false`. This covers four cases correctly:
  - Real → real (unchanged behavior, still lock-checked).
  - Real → future (skip lock check — it's leaving the balance-affecting set; only reachable when
    the guard above allowed it, i.e. no existing links).
  - Future → real (**do** lock-check — it's entering the balance-affecting set; must not let a
    future transaction dodge the lock by being converted).
  - Future → future (skip — never affected balances).
- **Balance invalidation:** currently this always calls `invalidate_balances`. Change to: skip
  invalidation only when **both** the old and new state are future (`existing.is_future &&
will_be_future`). In every other case (future→real, real→future, real→real with line-item
  changes) balances did or could change, so invalidate.
- **Link handling** depends on the transition:
  - Real → real: unchanged — call the existing `sync_links_after_update` exactly as today.
  - Future → real: this transaction has never had links (they're deferred while future). Call
    `create_links_for_transaction` (the same function the create path uses), not
    `sync_links_after_update` — there's nothing to "sync" against, this is its first time
    becoming linkable. Notify counterparties the same way `create_transaction_core` does
    (`notify_request_pending`, not the "changed" variant `sync_links_after_update`'s callers use).
  - Real → future: only reachable when the guard above confirmed no links exist, so there's
    nothing to sync or tear down — skip link handling entirely.
  - Future → future: no links exist yet — skip link handling entirely.
- Persist `is_future` in the `tx.transaction.update({ data: { ... } })` call (Prisma leaves a
  field untouched when you pass `undefined`, matching existing `datetime`/`description` handling
  — confirm this still holds if you refactor the data object).

### 4.4 New: convert-to-real

Don't invent a bespoke code path — converting is just `update_transaction_core(user_id, id, line_items, datetime, description, /* is_future */ false)` called with the transaction's own current `line_items`/`datetime`/`description` unchanged and `is_future: false`. That reuses every guard above for free (lock-date check applies, balances invalidate).

But the **caller ergonomics** should be simple — add a small wrapper so UI code doesn't have to
re-fetch and re-send the full line item list just to flip a flag:

```ts
// app/_core/transactions_core.ts
export async function convert_future_transaction_core(user_id: string, id: string): Promise<ActionResult> {
  const existing = await prisma.transaction.findUnique({
    where: { id, user_id },
    include: { line_items: true },
  })
  if (!existing) return err('NOT_FOUND', 'Transaction not found')
  if (!existing.is_future) return err('VALIDATION', 'Transaction is already real')
  return update_transaction_core(
    user_id,
    id,
    existing.line_items.map(li => ({
      accounting_head_id: li.accounting_head_id,
      asset_id: li.asset_id,
      quantity: li.quantity?.toNumber(),
      txn_value: li.txn_value === null ? null : li.txn_value.toNumber(),
      description: li.description,
      datetime: li.datetime,
    })),
    existing.datetime,
    existing.description,
    false,
  )
}
```

(Adjust to match whatever the final `update_transaction_core` signature looks like once `is_future`
is added — the point is: reuse it, don't duplicate its validation/lock/invalidation logic.)

Expose it as a server action in `app/_actions/transactions.ts`:

```ts
export async function convert_future_transaction(id: string): Promise<ActionResult> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  return convert_future_transaction_core(user_id, id)
}
```

### 4.5 `delete_transaction_core`

No functional change needed beyond confirming `prepare_links_for_delete` is a no-op for a future
transaction (it will be, since future transactions can't have links). Deleting a future
transaction should skip `invalidate_balances` — add a check: only invalidate if the deleted
transaction was not future. You'll need to select `is_future` in the pre-delete fetch.

### 4.6 `find_possible_duplicate`

No change needed — this is a UX nicety to avoid double-entry, and it's reasonable to keep it
active for future transactions too (avoids scheduling the same future entry twice). If it becomes
noisy in practice, scope it to `is_future: false` candidates only, but don't do that speculatively.

## 5. `/transactions/create` and edit forms (UI)

Web forms live at `app/transactions/create/ClientPage.tsx` (create) and
`app/transactions/[id]/update/ClientPage.tsx` (edit). Both build a `line_items` array and call
`create_transaction` / the update action from `app/_actions/transactions.ts` /
`app/transactions/[id]/update/transactions_update.ts` respectively.

- Add a checkbox/toggle, e.g. "Future transaction (won't affect balances until converted)", to
  both forms. Wire its state through to the `create_transaction(datetime, line_items, description,
{ is_future })` / update call.
- On the edit form, if the transaction is currently future, show the same checkbox (so a user can
  toggle it back to real on the same page if they want) **and** show a prominent "Convert to real
  transaction" button that calls `convert_future_transaction(id)` directly without requiring the
  user to touch the rest of the form — this is the flow the user described ("I shall be able to
  make changes to it and convert to real txn").
- `app/transactions/create/check_duplicate.ts` (the amber duplicate warning) can stay as-is; it
  calls `find_possible_duplicate` which still runs for future transactions per §4.6.

## 6. Head detail page — "Future transactions" section

File: `app/heads/[type]/[id]/page.tsx` (server) → `app/_components/HeadDetailPage.tsx` (client).

### 6.1 Data fetching (server)

Add a second query alongside the existing (now future-excluded, per §3.3) transaction fetch:

```ts
const future_transactions = await prisma.transaction.findMany({
  where: { user_id: user.id, is_future: true, line_items: { some: { accounting_head_id: head.id } } },
  include: { line_items: { include: { accounting_head: true, asset: true } } },
  orderBy: { datetime: 'asc' },
})
```

Normalize each with `normalize_txn` (same as the real-transaction path) so remainder lines are
resolved consistently.

### 6.2 Sufficiency check — exact algorithm

Scope: **only compute/display this for `account`-type heads.** Allocation and income/expense
heads don't have a spendable balance that can go negative in the way an account does — for those,
just list the future transactions (description, date, amount) with no sufficiency badge.

For an account-type head:

1. Start from the head's **current real per-asset balances** — this is exactly the
   `accountsToAssets.get(head.id)` map already available from `compute_balances_core`/the head
   page's existing balance computation (post-§3 fix, this is guaranteed to already exclude future
   transactions). Represent as `Map<asset_id, qty>` (a plain `number`, or `Prisma.Decimal` if you
   want to match the rest of the file's precision handling — the rest of this page already mixes
   both, follow whatever the surrounding code in that function uses at the point you're editing).
2. Sort this head's future transactions by `datetime` ascending (ties: stable/insertion order is
   fine — don't over-engineer tie-breaking).
3. Walk the sorted list once, maintaining a running per-asset qty map that starts as a copy of
   step 1's balances. For each future transaction:
   - For each of its normalized line items belonging to _this_ head, add `quantity` to that
     asset's running total in the map.
   - After applying all of this transaction's own line items on this head, check: for every asset
     this transaction touched on this head, is the running qty for that asset `>= 0`
     (allow the same tolerance the rest of the codebase uses, e.g. compare against
     `-0.0001` rather than exactly `0`, matching `closing_balance_core`'s rounding to 4 decimal
     places)? If yes for all touched assets → mark this future transaction `sufficient: true` for
     this head; if any touched asset goes negative → `sufficient: false`.
   - Carry the updated running totals forward into the next iteration (later future transactions
     see the cumulative effect of earlier ones — the point of "will there be enough balance"
     depends on order).
4. Return, per future transaction: `{ id, datetime, description, sufficient, per_asset_delta }` (or
   whatever shape `HeadDetailPage` needs to render one row per transaction plus a badge).

This logic is pure and deserves a unit test — put it in `app/_utils/` (e.g.
`app/_utils/future_balance.ts`) as a standalone function taking `(current_balances: Map<string,
number>, future_txns: {...}[]) => FutureTxnRow[]`, so it's testable without a database, matching
the existing pattern of pure logic living in `app/_utils/*` with colocated `*.test.ts` files (see
`CLAUDE.md` → "Pure domain logic"). Don't inline this algorithm directly in the page component.

### 6.3 Rendering

In `HeadDetailPage.tsx`, add a new section (reuse `Card`/`EmptyState`/`LineItemRow` components
already imported there — follow the visual pattern of the existing line-items list) titled
"Future transactions", shown only when the list is non-empty (or always shown with an empty state,
matching how other optional sections on this page behave — check how e.g. the breakdown section
handles zero items and be consistent). Each row: date, description, amount, and — for account-type
heads only — a badge/icon indicating sufficient vs. insufficient balance (e.g. green check vs.
amber/red warning), matching the existing `link_severity` badge pattern used on the transactions
list page for visual consistency. Clicking a row navigates to `/transactions/[id]` (the existing
transaction detail page, which per §5 will show the convert/edit UI for it).

## 7. MCP parity (optional but recommended — repo convention states "write parity with the web UI

is a goal")

File split: `app/api/mcp/route.ts` (core tools) and `app/api/mcp/_extra_tools.ts`. Both proxy to
the same `app/_core/*` functions used by the web, so most of this falls out of §3/§4 automatically.
Explicit changes:

- `create_transaction` / `create_transactions` tool schemas: add optional `is_future: z.boolean().optional()`,
  passed through to `create_transaction_core`/`create_transactions_core`.
- `update_transaction` tool schema: add optional `is_future: z.boolean().optional()`.
- `list_transactions`: add an optional `future` enum param, e.g.
  `z.enum(['exclude', 'only', 'include']).optional()` defaulting to `'exclude'` (matching the web
  list page's behavior of never showing future transactions unless asked). Wire it to add/omit
  `is_future: false` / `is_future: true` / nothing in the underlying `where`.
- `get_transaction`: include `is_future` in the response payload.
- Add a `convert_future_transaction` tool (id in, calls `convert_future_transaction_core`,
  returns the post-write balances of touched accounts — matching the "every mutating transaction
  tool returns post-write balances" contract already documented in `CLAUDE.md`).
- Optional: `get_head` gains an `include_future_transactions: z.boolean().optional()` flag
  (matching the existing `include_line_items`/`include_timeseries` opt-in pattern) that returns
  the same future-transactions-with-sufficiency list the head page shows, reusing the §6.2
  algorithm. Only do this if full parity is wanted immediately; it's not required for the web
  feature to work.

Register any new Zod schema fields consistently with how neighboring tools already document
optional params in their description strings (the MCP tools lean heavily on descriptive text for
the connected model to self-serve — follow that style, don't just add an undocumented field).

## 8. Testing checklist

- Unit test the new sufficiency algorithm (§6.2) in isolation — no DB — with a handful of
  scenarios: single sufficient future txn, single insufficient one, a sequence where an earlier
  future txn's inflow makes a later outflow sufficient, multi-asset line items on the same head.
- `pnpm test -- future` (or whatever substring matches the new test file) plus the full
  `pnpm test`, `pnpm typecheck`, `pnpm lint` per `CLAUDE.md`'s CI gate — run all of them before
  considering this done.
- Manual/local verification (`pnpm dev` against the local Docker stack — see `CLAUDE.md` "Local
  stack"):
  1. Create a future transaction on an account head → confirm it does **not** appear on
     `/transactions`, and the head's total/balance is unchanged.
  2. Confirm it **does** appear in the new "Future transactions" section on that head's page, with
     a correct sufficiency badge.
  3. Edit its line items/date while still future → confirm balances still unaffected.
  4. Convert it to real → confirm it now appears on `/transactions`, the head balance updates, and
     (if it was dated within a locked period) the conversion is rejected with a clear lock error.
  5. Create a future transaction on a linked/shared account → confirm the counterparty sees
     **nothing** (no pending request, no mirror). Convert it to real → confirm a pending request
     now appears for the counterparty, exactly like a normal fresh create on a shared account.
  6. Take an existing real transaction that's already linked (has an approved/pending
     counterparty copy) and try to mark it future → confirm it's rejected with a clear validation
     error. A real transaction on a linked account with **no** existing link row (edge case, e.g.
     the counterparty already deleted their copy) marking future should be allowed.
  7. Attachments: add an attachment to a future transaction → confirm it behaves identically to a
     real transaction's attachments (upload/view/delete), since attachments are scoped by
     transaction id + user_id regardless of `is_future`.

## 9. Summary of touched files

- `prisma/schema.prisma` (+ generated migration)
- `app/_core/transactions_core.ts` — is_future threading, guards, new
  `convert_future_transaction_core`
- `app/_core/balances_core.ts` — exclude future in both functions
- `app/_core/valuation_core.ts` — exclude future in `fetch_subtree_cashflows`
- `app/_actions/transactions.ts` — new `convert_future_transaction` action, pass `is_future`
  through `create_transaction`
- `app/transactions/[id]/update/transactions_update.ts` — pass `is_future` through
- `app/transactions/page.tsx` — exclude future (both query paths)
- `app/transactions/create/ClientPage.tsx` — future checkbox
- `app/transactions/[id]/update/ClientPage.tsx` — future checkbox + "convert to real" button
- `app/transactions/[id]/page.tsx` + `ClientPage.tsx` — surface `is_future` + convert action
- `app/heads/[type]/[id]/page.tsx` — exclude future from main query, fetch future list, run
  sufficiency algorithm
- `app/_components/HeadDetailPage.tsx` — new "Future transactions" section
- `app/assets/[id]/page.tsx` — exclude future
- `app/_components/HomeNetWorthTrend.tsx` — exclude future
- `app/page.tsx` — exclude future (month_txns, recent_txns)
- New `app/_utils/future_balance.ts` (+ `.test.ts`) — pure sufficiency algorithm
- `app/api/mcp/route.ts`, `app/api/mcp/_extra_tools.ts` — parity (§7)

Re-run the grep in §3 before calling this done, to catch any transaction query this plan missed.
