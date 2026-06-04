import 'server-only'
import { prisma } from '@/lib/prisma'

// Shared data layer for the export/dump features:
//   - collect_user_export(user_id) — every table holding the caller's data,
//     scoped to them (CSV zip, linked Excel, and the user-scoped SQL dump).
//   - collect_full_dump() — every table, every row (admin-only complete dump).
//
// Rows are returned as raw typed values; consumers stringify (CSV/Excel via
// `cell`) or render SQL literals as they see fit.
//
// `$1` is bound to the user id (referenced more than once in some clauses, which
// Postgres allows). Table names and WHERE clauses are static literals — never
// request input — so the only bound parameter is the user id; no injection surface.
const USER_TABLES: { table: string; where: string }[] = [
  { table: 'user', where: 'WHERE "id" = $1' },
  { table: 'push_subscription', where: 'WHERE "user_id" = $1' },
  { table: 'accounting_head', where: 'WHERE "user_id" = $1' },
  // asset is a global catalog (no user_id) — include only the ones this user
  // references, from either real or template line items.
  {
    table: 'asset',
    where:
      'WHERE "id" IN (' +
      'SELECT "asset_id" FROM "line_item" WHERE "transaction_id" IN (SELECT "id" FROM "transaction" WHERE "user_id" = $1) ' +
      'UNION SELECT "asset_id" FROM "line_item_template" WHERE "transaction_template_id" IN (SELECT "id" FROM "transaction_template" WHERE "user_id" = $1))',
  },
  { table: 'transaction_template', where: 'WHERE "user_id" = $1' },
  { table: 'line_item_template', where: 'WHERE "transaction_template_id" IN (SELECT "id" FROM "transaction_template" WHERE "user_id" = $1)' },
  { table: 'transaction', where: 'WHERE "user_id" = $1' },
  { table: 'transaction_attachment', where: 'WHERE "transaction_id" IN (SELECT "id" FROM "transaction" WHERE "user_id" = $1)' },
  { table: 'line_item', where: 'WHERE "transaction_id" IN (SELECT "id" FROM "transaction" WHERE "user_id" = $1)' },
  { table: 'transaction_link', where: 'WHERE "user_a_id" = $1 OR "user_b_id" = $1' },
]

// Default exclusion for the data exports (CSV/Excel): the user's bcrypt hash is
// an auth credential and doesn't belong in a spreadsheet. The SQL dumps, being
// restorable backups, pass `{}` to keep every column.
export const DEFAULT_EXCLUDED_COLUMNS: Record<string, Set<string>> = {
  user: new Set(['password_hash']),
}

// Foreign keys per table: column -> the table it points at. Drives the Excel
// export's clickable links (and documents the relational graph). Columns whose
// target row isn't in the export — e.g. a counterparty's user/transaction — are
// simply left as plain text by the consumer.
const FOREIGN_KEYS: Record<string, Record<string, string>> = {
  push_subscription: { user_id: 'user' },
  accounting_head: { user_id: 'user', parent_id: 'accounting_head', linked_user_id: 'user' },
  asset: { parent_id: 'asset' },
  transaction_template: { user_id: 'user' },
  line_item_template: { transaction_template_id: 'transaction_template', accounting_head_id: 'accounting_head', asset_id: 'asset' },
  transaction: { user_id: 'user' },
  transaction_attachment: { transaction_id: 'transaction' },
  line_item: { transaction_id: 'transaction', accounting_head_id: 'accounting_head', asset_id: 'asset' },
  transaction_link: { user_a_id: 'user', user_b_id: 'user', txn_a_id: 'transaction', txn_b_id: 'transaction', pending_by: 'user' },
  user: {
    default_account_id: 'accounting_head',
    default_allocation_id: 'accounting_head',
    default_income_expense_id: 'accounting_head',
    default_asset_id: 'asset',
  },
}

// Restore-friendly table order for the complete dump: parents before children,
// so inter-table foreign keys mostly resolve as the file is replayed. Tables not
// listed (e.g. a future addition) sort to the end, alphabetically.
const FULL_TABLE_ORDER = [
  'user',
  'asset',
  'accounting_head',
  'push_subscription',
  'transaction_template',
  'transaction',
  'line_item_template',
  'line_item',
  'transaction_attachment',
  'transaction_link',
  'server_metric',
  'slow_query',
  'web_vital',
  '_prisma_migrations',
]

// Postgres types we surface as real numbers (Excel cells / unquoted SQL literals).
const NUMERIC_TYPES = new Set(['integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision'])

export type TableExport = {
  table: string
  columns: string[]
  numericColumns: string[]
  foreignKeys: Record<string, string>
  rows: unknown[][]
}

// Stringify a raw cell for the text exports (CSV/Excel). SQL rendering keeps the
// raw value instead, so types survive into the dump.
export function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

// Column name + type for a table, in declaration order (so an export has a
// header even when empty, and new columns are picked up automatically).
async function table_meta(table: string): Promise<{ name: string; numeric: boolean }[]> {
  const rows = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    table,
  )
  return rows.map(r => ({ name: r.column_name, numeric: NUMERIC_TYPES.has(r.data_type) }))
}

export async function collect_user_export(user_id: string, excluded: Record<string, Set<string>> = DEFAULT_EXCLUDED_COLUMNS): Promise<TableExport[]> {
  return Promise.all(
    USER_TABLES.map(async ({ table, where }) => {
      const drop = excluded[table]
      const meta = (await table_meta(table)).filter(m => !drop?.has(m.name))
      const columns = meta.map(m => m.name)
      const quoted = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(', ')
      const raw = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT ${quoted} FROM "${table}" ${where}`, user_id)
      return {
        table,
        columns,
        numericColumns: meta.filter(m => m.numeric).map(m => m.name),
        foreignKeys: FOREIGN_KEYS[table] ?? {},
        rows: raw.map(r => columns.map(c => r[c])),
      }
    }),
  )
}

// Every base table in the public schema, every row — for the admin-only dump.
export async function collect_full_dump(): Promise<TableExport[]> {
  const found = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  )
  const rank = (t: string) => {
    const i = FULL_TABLE_ORDER.indexOf(t)
    return i < 0 ? FULL_TABLE_ORDER.length : i
  }
  const names = found.map(t => t.table_name).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))

  return Promise.all(
    names.map(async table => {
      const meta = await table_meta(table)
      const columns = meta.map(m => m.name)
      const quoted = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(', ')
      const raw = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT ${quoted} FROM "${table}"`)
      return {
        table,
        columns,
        numericColumns: meta.filter(m => m.numeric).map(m => m.name),
        foreignKeys: {},
        rows: raw.map(r => columns.map(c => r[c])),
      }
    }),
  )
}
