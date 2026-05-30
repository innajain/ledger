/**
 * Seed a `demo` user with realistic-looking transactions across the last 6 months.
 *
 * Idempotent: if a `demo` user exists, all its data is wiped and recreated.
 *
 * Run against local: pnpm dlx tsx scripts/seed_demo.ts
 * Run against prod: DATABASE_URL="$NEON_DIRECT" pnpm dlx tsx scripts/seed_demo.ts
 */

import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

const DEMO_USERNAME = 'demo'
const DEMO_PASSWORD = 'demo1234'

// Deterministic PRNG so re-runs produce stable data
let _seed = 42
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

function makeDate(year: number, month: number, day: number, hour = 12, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30))
}

// ---------- account & asset definitions ----------

type AccountSpec = { type: 'account' | 'income_expense' | 'allocation'; name: string; parent?: string; is_placeholder?: boolean }

const ACCOUNTS: AccountSpec[] = [
  // --- Real ---
  { type: 'account', name: 'Bank', is_placeholder: true },
  { type: 'account', name: 'HDFC Salary', parent: 'Bank' },
  { type: 'account', name: 'SBI Savings', parent: 'Bank' },
  { type: 'account', name: 'Wallet' },
  { type: 'account', name: 'Credit Cards', is_placeholder: true },
  { type: 'account', name: 'Axis Card', parent: 'Credit Cards' },
  { type: 'account', name: 'Demat', is_placeholder: true },
  { type: 'account', name: 'MF Holdings', parent: 'Demat' },
  { type: 'account', name: 'ETF Holdings', parent: 'Demat' },
  { type: 'account', name: 'Friends', is_placeholder: true },
  { type: 'account', name: 'Rohan', parent: 'Friends' },
  { type: 'account', name: 'Priya', parent: 'Friends' },

  // --- Nominal ---
  { type: 'income_expense', name: 'Income', is_placeholder: true },
  { type: 'income_expense', name: 'Salary', parent: 'Income' },
  { type: 'income_expense', name: 'Cashbacks', parent: 'Income' },
  { type: 'income_expense', name: 'Interest', parent: 'Income' },
  { type: 'income_expense', name: 'Expenses' },
  { type: 'income_expense', name: 'Opening Balance' },
  { type: 'income_expense', name: 'Trading Account' },

  // --- Allocation ---
  { type: 'allocation', name: 'Monthly Expenses', is_placeholder: true },
  { type: 'allocation', name: 'Food', parent: 'Monthly Expenses' },
  { type: 'allocation', name: 'Commute', parent: 'Monthly Expenses' },
  { type: 'allocation', name: 'Groceries', parent: 'Monthly Expenses' },
  { type: 'allocation', name: 'Entertainment', parent: 'Monthly Expenses' },
  { type: 'allocation', name: 'Utilities', parent: 'Monthly Expenses' },
  { type: 'allocation', name: 'Subscriptions', parent: 'Monthly Expenses' },
  { type: 'allocation', name: 'Discretionary', parent: 'Monthly Expenses' },
  { type: 'allocation', name: 'Yearly Expenses', is_placeholder: true },
  { type: 'allocation', name: 'Insurance', parent: 'Yearly Expenses' },
  { type: 'allocation', name: 'Send to Home', parent: 'Yearly Expenses' },
  { type: 'allocation', name: 'Rent' },
  { type: 'allocation', name: 'Investments' },
  { type: 'allocation', name: 'Savings' },
  { type: 'allocation', name: 'Unallocated' },
]

type AssetSpec = { type: 'rupees' | 'mf' | 'etf'; name: string; ticker?: string }
const ASSETS: AssetSpec[] = [
  { type: 'rupees', name: 'Money' },
  { type: 'mf', name: 'Parag Parikh Flexi Cap', ticker: 'INF879O01027' },
  { type: 'mf', name: 'HDFC Flexicap Fund', ticker: 'INF179K01UT0' },
  { type: 'etf', name: 'Mirae Gold ETF', ticker: 'GOLDETF.NS' },
]

// ---------- transaction generation ----------

type Line = { account: string; asset?: string; quantity: number | null; txn_value?: number | null; description?: string }
type Txn = { datetime: Date; description?: string; lines: Line[] }

// Real-only expense: real(-amt) → Expenses → allocation
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

// Income: real(+amt) → income-nominal → allocation
function income(date: Date, account: string, nominal: string, alloc: string, amount: number, description: string): Txn {
  return {
    datetime: date,
    description,
    lines: [
      { account, asset: 'Money', quantity: amount },
      { account: nominal, asset: 'Money', quantity: null },
      { account: alloc, asset: 'Money', quantity: null },
    ],
  }
}

// Bank → wallet transfer (real-only, sums to zero)
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

// MF/ETF buy
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

const FOOD_ITEMS = ['lunch', 'chai', 'samosa', 'dosa', 'biryani', 'pizza slice', 'sandwich', 'coffee', 'momos', 'thali']
const GROCERY_ITEMS = ['blinkit groceries', 'zepto', 'instamart', 'vegetables', 'monthly groceries', 'kitchen restock']
const ENT_ITEMS = ['movie', 'concert ticket', 'pub night', 'bowling', 'gaming']
const DISCRETIONARY = ['amazon order', 'new headphones', 'gift for mom', 'shoes', 'haircut', 'book', 'plant pot', 'phone case']
const CAB_ITEMS = ['uber to office', 'ola airport', 'rapido', 'late night cab']

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

  // Opening balances on first day
  txns.push(
    income(makeDate(2025, 12, 1, 9), 'HDFC Salary', 'Opening Balance', 'Savings', 50000, 'opening balance'),
    income(makeDate(2025, 12, 1, 9), 'SBI Savings', 'Opening Balance', 'Savings', 25000, 'opening balance'),
    income(makeDate(2025, 12, 1, 9), 'Wallet', 'Opening Balance', 'Unallocated', 1500, 'opening cash'),
  )

  for (const [y, m] of months) {
    // Salary
    txns.push(income(makeDate(y, m, 1, 10, 30), 'HDFC Salary', 'Salary', 'Savings', 80000, 'salary credit'))

    // Rent
    txns.push(expense(makeDate(y, m, 5, 11), 'HDFC Salary', 'Rent', 25000, 'rent'))

    // Utilities
    txns.push(expense(makeDate(y, m, 7, 20), 'HDFC Salary', 'Utilities', 749, 'wifi'))
    txns.push(expense(makeDate(y, m, 10, 19), 'HDFC Salary', 'Utilities', randFloat(1200, 2400, 0), 'electricity'))
    if (m % 2 === 0) txns.push(expense(makeDate(y, m, 15, 12), 'HDFC Salary', 'Utilities', 299, 'mobile recharge'))

    // Subscriptions
    if (m === 12 || m === 4) txns.push(expense(makeDate(y, m, 12, 8), 'Axis Card', 'Subscriptions', 649, 'netflix'))
    if (m === 1 || m === 5) txns.push(expense(makeDate(y, m, 20, 8), 'Axis Card', 'Subscriptions', 199, 'spotify'))

    // SIPs on 7th
    txns.push(buyAsset(makeDate(y, m, 7, 11), 'HDFC Salary', 'MF Holdings', 'Parag Parikh Flexi Cap', randFloat(75, 95, 3), 10000, 'sip ppfas'))
    txns.push(buyAsset(makeDate(y, m, 7, 11), 'HDFC Salary', 'MF Holdings', 'HDFC Flexicap Fund', randFloat(45, 55, 3), 8000, 'sip hdfc flexi'))

    // Send to home
    txns.push(expense(makeDate(y, m, 25, 18), 'HDFC Salary', 'Send to Home', 10000, 'sent to mom'))

    // Cashback (random)
    if (rand() < 0.7) {
      const amt = randFloat(35, 200, 2)
      txns.push(income(makeDate(y, m, randint(8, 25), 14), 'Axis Card', 'Cashbacks', 'Unallocated', amt, 'card cashback'))
    }

    // Bank → wallet (cash withdrawal)
    if (rand() < 0.6) {
      txns.push(transfer(makeDate(y, m, randint(3, 20), 13), 'HDFC Salary', 'Wallet', 2000, 'atm withdrawal'))
    }

    // Daily expenses: lunch (~weekdays), commute, chai
    const daysInMonth = new Date(y, m, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const date = makeDate(y, m, d, 13)
      const dow = date.getUTCDay()
      const isWeekend = dow === 0 || dow === 6

      // Lunch (weekdays mostly)
      if (!isWeekend && rand() < 0.85) {
        const account = pick(['HDFC Salary', 'HDFC Salary', 'Wallet']) // mostly UPI from HDFC, sometimes cash
        const amt = randFloat(80, 280)
        txns.push(expense(makeDate(y, m, d, 13, randint(0, 50)), account, 'Food', amt, pick(FOOD_ITEMS)))
      }
      // Chai / coffee
      if (rand() < 0.4) {
        const amt = randFloat(15, 65)
        txns.push(
          expense(
            makeDate(y, m, d, randint(10, 18), randint(0, 50)),
            pick(['Wallet', 'HDFC Salary']),
            'Food',
            amt,
            pick(['chai', 'coffee', 'cutting chai']),
          ),
        )
      }
      // Commute (metro/bus on weekdays)
      if (!isWeekend && rand() < 0.7) {
        const amt = randFloat(15, 60)
        txns.push(expense(makeDate(y, m, d, randint(8, 20), randint(0, 50)), 'HDFC Salary', 'Commute', amt, 'metro'))
      }
      // Cab occasionally
      if (rand() < 0.08) {
        const amt = randFloat(120, 450, 0)
        txns.push(expense(makeDate(y, m, d, randint(20, 23), 0), 'HDFC Salary', 'Commute', amt, pick(CAB_ITEMS)))
      }
    }

    // Groceries: 2-4 per month
    for (let i = 0; i < randint(2, 4); i++) {
      const amt = randFloat(450, 2400, 0)
      txns.push(
        expense(
          makeDate(y, m, randint(1, daysInMonth), 19),
          pick(['HDFC Salary', 'Axis Card', 'HDFC Salary']),
          'Groceries',
          amt,
          pick(GROCERY_ITEMS),
        ),
      )
    }

    // Entertainment: 1-3
    for (let i = 0; i < randint(1, 3); i++) {
      const amt = randFloat(250, 1400, 0)
      txns.push(expense(makeDate(y, m, randint(5, daysInMonth), 21), pick(['Axis Card', 'HDFC Salary']), 'Entertainment', amt, pick(ENT_ITEMS)))
    }

    // Discretionary: 2-5
    for (let i = 0; i < randint(2, 5); i++) {
      const amt = randFloat(150, 3500, 0)
      txns.push(expense(makeDate(y, m, randint(1, daysInMonth), 17), pick(['Axis Card', 'HDFC Salary']), 'Discretionary', amt, pick(DISCRETIONARY)))
    }

    // Credit card EMI/bill payment (transfer)
    if (rand() < 0.9) {
      const amt = randFloat(3000, 9000, 0)
      txns.push(transfer(makeDate(y, m, 18, 11), 'HDFC Salary', 'Axis Card', amt, 'credit card payment'))
    }

    // Settling with friends: lent / received
    if (rand() < 0.5) {
      const amt = randFloat(150, 800, 0)
      const friend = pick(['Rohan', 'Priya'])
      // Paid for friend's food
      txns.push({
        datetime: makeDate(y, m, randint(2, daysInMonth), 20),
        description: `${friend.toLowerCase()}'s share`,
        lines: [
          { account: friend, asset: 'Money', quantity: amt },
          { account: 'HDFC Salary', asset: 'Money', quantity: -2 * amt },
          { account: 'Expenses', asset: 'Money', quantity: null },
          { account: 'Food', asset: 'Money', quantity: null },
        ],
      })
    }
    if (rand() < 0.3) {
      const amt = randFloat(200, 1500, 0)
      const friend = pick(['Rohan', 'Priya'])
      txns.push(transfer(makeDate(y, m, randint(2, daysInMonth), 19), friend, 'HDFC Salary', amt, `${friend.toLowerCase()} settled`))
    }
  }

  // One-time: insurance (Mar)
  txns.push(expense(makeDate(2026, 3, 14, 11), 'HDFC Salary', 'Insurance', 12000, 'term insurance premium'))

  // One-time: ETF buy
  txns.push(buyAsset(makeDate(2026, 2, 17, 10, 30), 'HDFC Salary', 'ETF Holdings', 'Mirae Gold ETF', 50, 7200, 'bought gold etf'))

  // Interest credit
  txns.push(income(makeDate(2026, 3, 31, 20), 'SBI Savings', 'Interest', 'Savings', 187, 'savings interest q4'))

  return txns
}

// ---------- write to DB ----------

async function main() {
  console.log(`Connecting to ${process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] ?? 'db'}`)

  // 1. Wipe existing demo user
  const existing = await prisma.user.findUnique({ where: { username: DEMO_USERNAME } })
  if (existing) {
    console.log(`Deleting existing demo user ${existing.id}...`)
    await prisma.transaction.deleteMany({ where: { user_id: existing.id } })
    await prisma.transaction_template.deleteMany({ where: { user_id: existing.id } })
    await prisma.accounting_head.deleteMany({ where: { user_id: existing.id } })
    await prisma.user.delete({ where: { id: existing.id } })
  }

  // 2. Create user
  const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const user = await prisma.user.create({ data: { username: DEMO_USERNAME, password_hash } })
  console.log(`Created user ${user.username} (${user.id}) — password: ${DEMO_PASSWORD}`)

  // 3. Create accounts (two passes: parents first, then children)
  const accIdByName = new Map<string, string>()
  for (const a of ACCOUNTS.filter(a => !a.parent)) {
    const row = await prisma.accounting_head.create({
      data: { user_id: user.id, name: a.name, type: a.type, is_placeholder: a.is_placeholder ?? false, order_index: accIdByName.size },
    })
    accIdByName.set(a.name, row.id)
  }
  for (const a of ACCOUNTS.filter(a => a.parent)) {
    const row = await prisma.accounting_head.create({
      data: {
        user_id: user.id,
        name: a.name,
        type: a.type,
        parent_id: accIdByName.get(a.parent!)!,
        is_placeholder: a.is_placeholder ?? false,
        order_index: accIdByName.size,
      },
    })
    accIdByName.set(a.name, row.id)
  }
  console.log(`Created ${accIdByName.size} accounts`)

  // 4. Create assets
  // Assets are global (admin-managed) — reuse an existing asset with the same
  // name, otherwise create it.
  const assetIdByName = new Map<string, string>()
  for (const a of ASSETS) {
    const row = await prisma.asset.upsert({
      where: { name: a.name },
      update: {},
      create: { name: a.name, type: a.type, ticker: a.ticker ?? null, order_index: assetIdByName.size },
    })
    assetIdByName.set(a.name, row.id)
  }
  console.log(`Created ${assetIdByName.size} assets`)

  // 5. Generate and insert transactions
  const txns = generateTxns()
  console.log(`Generating ${txns.length} transactions...`)
  for (const t of txns) {
    await prisma.transaction.create({
      data: {
        user_id: user.id,
        datetime: t.datetime,
        description: t.description ?? null,
        line_items: {
          create: t.lines.map(li => ({
            accounting_head_id: accIdByName.get(li.account)!,
            asset_id: assetIdByName.get(li.asset ?? 'Money')!,
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
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
