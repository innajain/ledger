/**
 * Seed a single realistic sample user (modeled on a real user's chart of
 * accounts: Indian banks, UPI apps, credit cards, a Groww demat, and people).
 * Creates ~6 months of believable transactions. Does NOT touch any other user.
 *
 * Idempotent: if the sample user exists, its data is wiped and recreated.
 *
 * Local:  pnpm dlx tsx scripts/seed_sample_user.ts
 * Prod:   DATABASE_URL="$NEON_DIRECT" pnpm dlx tsx scripts/seed_sample_user.ts
 */

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const USERNAME = 'rahul'
const PASSWORD = 'rahul1234'
const UPI_ID = 'rahul.verma@okhdfcbank'

// Deterministic PRNG so re-runs produce stable data.
let _seed = 1337
function rand() {
  _seed = (_seed * 1664525 + 1013904223) & 0xffffffff
  return (_seed >>> 0) / 0x100000000
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}
function randint(lo: number, hi: number) {
  return Math.floor(rand() * (hi - lo + 1)) + lo
}
function randFloat(lo: number, hi: number, decimals = 2) {
  const v = rand() * (hi - lo) + lo
  return Math.round(v * 10 ** decimals) / 10 ** decimals
}
// IST midday for the given calendar day (UTC+5:30 → subtract 5:30).
function makeDate(year: number, month: number, day: number, hour = 12, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30))
}

// ---------- chart of accounts ----------

type AccountSpec = { type: 'account' | 'income_expense' | 'allocation'; name: string; parent?: string; is_placeholder?: boolean }

const ACCOUNTS: AccountSpec[] = [
  // --- Accounts (where money lives) ---
  { type: 'account', name: 'Bank', is_placeholder: true },
  { type: 'account', name: 'HDFC', parent: 'Bank' },
  { type: 'account', name: 'ICICI', parent: 'Bank' },
  { type: 'account', name: 'SBI', parent: 'Bank' },
  { type: 'account', name: 'UPI Apps', is_placeholder: true },
  { type: 'account', name: 'Google Pay', parent: 'UPI Apps' },
  { type: 'account', name: 'Paytm', parent: 'UPI Apps' },
  { type: 'account', name: 'Cash' },
  { type: 'account', name: 'Credit Cards', is_placeholder: true },
  { type: 'account', name: 'HDFC Millennia', parent: 'Credit Cards' },
  { type: 'account', name: 'Amazon Pay ICICI', parent: 'Credit Cards' },
  { type: 'account', name: 'Wallets', is_placeholder: true },
  { type: 'account', name: 'Amazon Pay Balance', parent: 'Wallets' },
  { type: 'account', name: 'Groww', is_placeholder: true },
  { type: 'account', name: 'Groww Balance', parent: 'Groww' },
  { type: 'account', name: 'Demat', parent: 'Groww', is_placeholder: true },
  { type: 'account', name: 'MF Holdings', parent: 'Demat' },
  { type: 'account', name: 'ETF Holdings', parent: 'Demat' },
  { type: 'account', name: 'EPF' },
  { type: 'account', name: 'People', is_placeholder: true },
  { type: 'account', name: 'Karan', parent: 'People' },
  { type: 'account', name: 'Sneha', parent: 'People' },

  // --- Income / Expense ---
  { type: 'income_expense', name: 'Income', is_placeholder: true },
  { type: 'income_expense', name: 'Salary', parent: 'Income' },
  { type: 'income_expense', name: 'Cashbacks', parent: 'Income' },
  { type: 'income_expense', name: 'Interest', parent: 'Income' },
  { type: 'income_expense', name: 'Gift', parent: 'Income' },
  { type: 'income_expense', name: 'Expenses' },
  { type: 'income_expense', name: 'Opening Balance' },
  { type: 'income_expense', name: 'Trading Account' },

  // --- Allocation (budget buckets) ---
  { type: 'allocation', name: 'Monthly Expenses', is_placeholder: true },
  { type: 'allocation', name: 'Rent', parent: 'Monthly Expenses' },
  { type: 'allocation', name: 'Groceries', parent: 'Monthly Expenses' },
  { type: 'allocation', name: 'Food', parent: 'Monthly Expenses' },
  { type: 'allocation', name: 'Commute', parent: 'Monthly Expenses' },
  { type: 'allocation', name: 'Utilities', parent: 'Monthly Expenses' },
  { type: 'allocation', name: 'Subscriptions', parent: 'Monthly Expenses' },
  { type: 'allocation', name: 'Entertainment', parent: 'Monthly Expenses' },
  { type: 'allocation', name: 'Discretionary', parent: 'Monthly Expenses' },
  { type: 'allocation', name: 'Yearly Expenses', is_placeholder: true },
  { type: 'allocation', name: 'Insurance', parent: 'Yearly Expenses' },
  { type: 'allocation', name: 'Send to Home', parent: 'Yearly Expenses' },
  { type: 'allocation', name: 'Investments' },
  { type: 'allocation', name: 'Savings', is_placeholder: true },
  { type: 'allocation', name: 'Emergency Fund', parent: 'Savings' },
  { type: 'allocation', name: 'Unallocated' },
]

type AssetSpec = { type: 'rupees' | 'mf' | 'etf'; name: string; ticker?: string }
const ASSETS: AssetSpec[] = [
  { type: 'rupees', name: 'Money' },
  { type: 'mf', name: 'Parag Parikh Flexi Cap', ticker: 'INF879O01027' },
  { type: 'mf', name: 'HDFC Flexicap Fund', ticker: 'INF179K01UT0' },
  { type: 'etf', name: 'Mirae Gold ETF', ticker: 'GOLDETF.NS' },
]

// ---------- transaction builders (triple-entry, null-remainder) ----------

type Line = { account: string; asset?: string; quantity: number | null; txn_value?: number | null; description?: string }
type Txn = { datetime: Date; description?: string; lines: Line[] }

function expense(date: Date, account: string, alloc: string, amount: number, description: string): Txn {
  return {
    datetime: date,
    description,
    lines: [
      { account, asset: 'Money', quantity: -amount },
      { account: 'Expenses', asset: 'Money', quantity: null },
      { account: alloc, asset: 'Money', quantity: null },
    ],
  }
}
function income(date: Date, account: string, incomeHead: string, alloc: string, amount: number, description: string): Txn {
  return {
    datetime: date,
    description,
    lines: [
      { account, asset: 'Money', quantity: amount },
      { account: incomeHead, asset: 'Money', quantity: null },
      { account: alloc, asset: 'Money', quantity: null },
    ],
  }
}
function transfer(date: Date, from: string, to: string, amount: number, description: string): Txn {
  return {
    datetime: date,
    description,
    lines: [
      { account: from, asset: 'Money', quantity: -amount },
      { account: to, asset: 'Money', quantity: amount },
    ],
  }
}
function buyAsset(date: Date, payFrom: string, holdingAccount: string, asset: string, units: number, value: number, description: string): Txn {
  return {
    datetime: date,
    description,
    lines: [
      { account: payFrom, asset: 'Money', quantity: -value },
      { account: 'Trading Account', asset: 'Money', quantity: null },
      { account: 'Investments', asset: 'Money', quantity: null },
      { account: holdingAccount, asset, quantity: units, txn_value: value },
      { account: 'Trading Account', asset, quantity: null, txn_value: null },
      { account: 'Investments', asset, quantity: null, txn_value: null },
    ],
  }
}

const FOOD = ['lunch', 'chai', 'samosa', 'dosa', 'biryani', 'pizza slice', 'sandwich', 'filter coffee', 'momos', 'thali']
const GROCERY = ['blinkit groceries', 'zepto', 'instamart', 'vegetables', 'monthly groceries', 'kitchen restock']
const ENT = ['movie', 'concert ticket', 'pub night', 'bowling', 'gaming top-up']
const DISC = ['amazon order', 'new earbuds', 'gift for mom', 'sneakers', 'haircut', 'book', 'plant pot', 'phone case']
const CABS = ['uber to office', 'ola airport', 'rapido', 'late night cab']

function generateTxns(): Txn[] {
  const txns: Txn[] = []
  const months: [number, number][] = [
    [2025, 12],
    [2026, 1],
    [2026, 2],
    [2026, 3],
    [2026, 4],
    [2026, 5],
  ]

  // Opening balances
  txns.push(
    income(makeDate(2025, 12, 1, 9), 'HDFC', 'Opening Balance', 'Savings', 120000, 'opening balance'),
    income(makeDate(2025, 12, 1, 9), 'ICICI', 'Opening Balance', 'Emergency Fund', 60000, 'opening balance'),
    income(makeDate(2025, 12, 1, 9), 'Cash', 'Opening Balance', 'Unallocated', 2500, 'opening cash'),
  )

  for (const [y, m] of months) {
    txns.push(income(makeDate(y, m, 1, 10, 30), 'HDFC', 'Salary', 'Unallocated', 95000, 'salary credit'))
    txns.push(expense(makeDate(y, m, 3, 11), 'HDFC', 'Rent', 28000, 'flat rent'))
    txns.push(expense(makeDate(y, m, 7, 20), 'HDFC', 'Utilities', 799, 'wifi (act fibernet)'))
    txns.push(expense(makeDate(y, m, 10, 19), 'HDFC', 'Utilities', randFloat(900, 2200, 0), 'electricity bill'))
    if (m % 2 === 0) txns.push(expense(makeDate(y, m, 15, 12), 'Google Pay', 'Utilities', 299, 'jio recharge'))

    if (m === 12 || m === 4) txns.push(expense(makeDate(y, m, 12, 8), 'HDFC Millennia', 'Subscriptions', 649, 'netflix'))
    if (m === 1 || m === 5) txns.push(expense(makeDate(y, m, 20, 8), 'HDFC Millennia', 'Subscriptions', 119, 'spotify'))

    // SIPs on the 5th
    txns.push(buyAsset(makeDate(y, m, 5, 11), 'HDFC', 'MF Holdings', 'Parag Parikh Flexi Cap', randFloat(75, 95, 3), 10000, 'sip ppfas'))
    txns.push(buyAsset(makeDate(y, m, 5, 11), 'HDFC', 'MF Holdings', 'HDFC Flexicap Fund', randFloat(45, 55, 3), 7500, 'sip hdfc flexi'))

    txns.push(expense(makeDate(y, m, 25, 18), 'HDFC', 'Send to Home', 10000, 'sent to parents'))

    if (rand() < 0.7)
      txns.push(income(makeDate(y, m, randint(8, 25), 14), 'HDFC Millennia', 'Cashbacks', 'Unallocated', randFloat(20, 220, 2), 'card cashback'))
    if (rand() < 0.6) txns.push(transfer(makeDate(y, m, randint(3, 20), 13), 'HDFC', 'Cash', 2000, 'atm withdrawal'))
    if (rand() < 0.5) txns.push(transfer(makeDate(y, m, randint(2, 26), 12), 'HDFC', 'Google Pay', randFloat(1000, 3000, 0), 'load gpay upi lite'))

    const daysInMonth = new Date(y, m, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const date = makeDate(y, m, d, 13)
      const isWeekend = date.getUTCDay() === 0 || date.getUTCDay() === 6
      if (!isWeekend && rand() < 0.85)
        txns.push(expense(makeDate(y, m, d, 13, randint(0, 50)), pick(['HDFC', 'Google Pay', 'Paytm']), 'Food', randFloat(80, 280), pick(FOOD)))
      if (rand() < 0.4)
        txns.push(
          expense(
            makeDate(y, m, d, randint(10, 18), randint(0, 50)),
            pick(['Cash', 'Google Pay']),
            'Food',
            randFloat(15, 65),
            pick(['chai', 'coffee', 'cutting chai']),
          ),
        )
      if (!isWeekend && rand() < 0.7)
        txns.push(expense(makeDate(y, m, d, randint(8, 20), randint(0, 50)), 'Google Pay', 'Commute', randFloat(15, 60), 'metro'))
      if (rand() < 0.08) txns.push(expense(makeDate(y, m, d, randint(20, 23), 0), 'HDFC', 'Commute', randFloat(120, 450, 0), pick(CABS)))
    }

    for (let i = 0; i < randint(2, 4); i++)
      txns.push(
        expense(makeDate(y, m, randint(1, daysInMonth), 19), pick(['HDFC', 'HDFC Millennia']), 'Groceries', randFloat(450, 2400, 0), pick(GROCERY)),
      )
    for (let i = 0; i < randint(1, 3); i++)
      txns.push(
        expense(
          makeDate(y, m, randint(5, daysInMonth), 21),
          pick(['HDFC Millennia', 'Amazon Pay ICICI']),
          'Entertainment',
          randFloat(250, 1400, 0),
          pick(ENT),
        ),
      )
    for (let i = 0; i < randint(2, 5); i++)
      txns.push(
        expense(
          makeDate(y, m, randint(1, daysInMonth), 17),
          pick(['HDFC Millennia', 'Amazon Pay ICICI', 'HDFC']),
          'Discretionary',
          randFloat(150, 3500, 0),
          pick(DISC),
        ),
      )

    // Credit card bill payments
    if (rand() < 0.9) txns.push(transfer(makeDate(y, m, 18, 11), 'HDFC', 'HDFC Millennia', randFloat(3000, 9000, 0), 'hdfc card bill'))
    if (rand() < 0.6) txns.push(transfer(makeDate(y, m, 19, 11), 'HDFC', 'Amazon Pay ICICI', randFloat(1500, 6000, 0), 'amazon pay card bill'))

    // Splitting with friends: paid for a friend, expect them to settle
    if (rand() < 0.5) {
      const amt = randFloat(150, 800, 0)
      const friend = pick(['Karan', 'Sneha'])
      txns.push({
        datetime: makeDate(y, m, randint(2, daysInMonth), 20),
        description: `${friend.toLowerCase()}'s share`,
        lines: [
          { account: friend, asset: 'Money', quantity: amt },
          { account: 'HDFC', asset: 'Money', quantity: -2 * amt },
          { account: 'Expenses', asset: 'Money', quantity: null },
          { account: 'Food', asset: 'Money', quantity: null },
        ],
      })
    }
    if (rand() < 0.4) {
      const friend = pick(['Karan', 'Sneha'])
      txns.push(
        transfer(makeDate(y, m, randint(2, daysInMonth), 19), friend, 'Google Pay', randFloat(200, 1500, 0), `${friend.toLowerCase()} settled up`),
      )
    }
  }

  // One-offs
  txns.push(expense(makeDate(2026, 3, 14, 11), 'HDFC', 'Insurance', 13500, 'term insurance premium'))
  txns.push(buyAsset(makeDate(2026, 2, 17, 10, 30), 'HDFC', 'ETF Holdings', 'Mirae Gold ETF', 60, 8600, 'bought gold etf'))
  txns.push(income(makeDate(2026, 3, 31, 20), 'ICICI', 'Interest', 'Emergency Fund', 642, 'savings interest q4'))
  txns.push(income(makeDate(2026, 1, 1, 12), 'HDFC', 'Gift', 'Unallocated', 5100, 'new year gift'))

  return txns
}

// ---------- write ----------

async function main() {
  console.log(`Connecting to ${process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] ?? 'db'}`)

  // Generate the transaction set ONCE (the PRNG is module-global, so calling
  // generateTxns again would yield a different list).
  const txns = generateTxns()

  // Sanity: every account/asset referenced by a transaction must be defined.
  const accNames = new Set(ACCOUNTS.map(a => a.name))
  const assetNames = new Set(ASSETS.map(a => a.name))
  for (const t of txns) {
    for (const li of t.lines) {
      if (!accNames.has(li.account)) throw new Error(`Unknown account referenced: ${li.account}`)
      if (li.asset && !assetNames.has(li.asset)) throw new Error(`Unknown asset referenced: ${li.asset}`)
    }
  }

  // 1. Wipe existing sample user (only this user)
  const existing = await prisma.user.findUnique({ where: { username: USERNAME } })
  if (existing) {
    console.log(`Deleting existing user ${USERNAME} (${existing.id})...`)
    await prisma.transaction.deleteMany({ where: { user_id: existing.id } })
    await prisma.transaction_template.deleteMany({ where: { user_id: existing.id } })
    await prisma.accounting_head.deleteMany({ where: { user_id: existing.id } })
    await prisma.user.delete({ where: { id: existing.id } })
  }

  // 2. Create user
  const password_hash = await bcrypt.hash(PASSWORD, 10)
  const user = await prisma.user.create({ data: { username: USERNAME, password_hash, upi_id: UPI_ID, theme: 'system' } })
  console.log(`Created user ${user.username} (${user.id}) — password: ${PASSWORD}`)

  // 3. Accounts (parents first, then children)
  const accId = new Map<string, string>()
  for (const a of ACCOUNTS.filter(a => !a.parent)) {
    const row = await prisma.accounting_head.create({
      data: { user_id: user.id, name: a.name, type: a.type, is_placeholder: a.is_placeholder ?? false, order_index: accId.size },
    })
    accId.set(a.name, row.id)
  }
  for (const a of ACCOUNTS.filter(a => a.parent)) {
    const row = await prisma.accounting_head.create({
      data: {
        user_id: user.id,
        name: a.name,
        type: a.type,
        parent_id: accId.get(a.parent!)!,
        is_placeholder: a.is_placeholder ?? false,
        order_index: accId.size,
      },
    })
    accId.set(a.name, row.id)
  }
  console.log(`Created ${accId.size} accounting heads`)

  // 4. Assets are global — reuse by name, else create.
  const assetId = new Map<string, string>()
  for (const a of ASSETS) {
    const row = await prisma.asset.upsert({
      where: { name: a.name },
      update: {},
      create: { name: a.name, type: a.type, ticker: a.ticker ?? null, order_index: assetId.size },
    })
    assetId.set(a.name, row.id)
  }

  // 5. Defaults for the create-transaction form
  await prisma.user.update({
    where: { id: user.id },
    data: {
      default_account_id: accId.get('HDFC')!,
      default_allocation_id: accId.get('Unallocated')!,
      default_income_expense_id: accId.get('Expenses')!,
      default_asset_id: assetId.get('Money')!,
    },
  })

  // 6. Transactions
  for (const t of txns) {
    await prisma.transaction.create({
      data: {
        user_id: user.id,
        datetime: t.datetime,
        description: t.description ?? null,
        line_items: {
          create: t.lines.map(li => ({
            accounting_head_id: accId.get(li.account)!,
            asset_id: assetId.get(li.asset ?? 'Money')!,
            quantity: li.quantity,
            txn_value: li.txn_value ?? null,
            description: li.description ?? null,
          })),
        },
      },
    })
  }
  console.log(`Inserted ${txns.length} transactions`)
}

main()
  .catch(e => {
    console.error('error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
