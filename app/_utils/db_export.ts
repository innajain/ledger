import 'server-only'
import { prisma } from '@/lib/prisma'
import { to_csv, formula_guard } from './csv'
import { build_zip } from './zip'
import { build_xlsx, type XlsxTable } from './xlsx'
import { build_sql_dump } from './sql_dump'

const USER_TABLES: { table: string; where: string }[] = [
  { table: 'user', where: 'WHERE "id" = $1' },
  { table: 'push_subscription', where: 'WHERE "user_id" = $1' },
  { table: 'accounting_head', where: 'WHERE "user_id" = $1' },

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

export const DEFAULT_EXCLUDED_COLUMNS: Record<string, Set<string>> = {
  user: new Set(['password_hash']),
}

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

const NUMERIC_TYPES = new Set(['integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision'])

export type TableExport = {
  table: string
  columns: string[]
  numericColumns: string[]
  foreignKeys: Record<string, string>
  rows: unknown[][]
}

export function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

async function tables_meta(tables: string[]): Promise<Map<string, { name: string; numeric: boolean }[]>> {
  const rows = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string; data_type: string }[]>(
    `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name, ordinal_position`,
    tables,
  )
  const by_table = new Map<string, { name: string; numeric: boolean }[]>()
  for (const r of rows) {
    let list = by_table.get(r.table_name)
    if (!list) by_table.set(r.table_name, (list = []))
    list.push({ name: r.column_name, numeric: NUMERIC_TYPES.has(r.data_type) })
  }
  return by_table
}

export async function collect_user_export(user_id: string, excluded: Record<string, Set<string>> = DEFAULT_EXCLUDED_COLUMNS): Promise<TableExport[]> {
  const meta_by_table = await tables_meta(USER_TABLES.map(t => t.table))
  return Promise.all(
    USER_TABLES.map(async ({ table, where }) => {
      const drop = excluded[table]
      const meta = (meta_by_table.get(table) ?? []).filter(m => !drop?.has(m.name))
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

// Sequential per-table generator so the admin dump route can stream: peak memory
// is one table's rows, not every table at once (the metrics tables are unbounded).
export async function* collect_full_dump_tables(): AsyncGenerator<TableExport, void> {
  const found = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  )
  const rank = (t: string) => {
    const i = FULL_TABLE_ORDER.indexOf(t)
    return i < 0 ? FULL_TABLE_ORDER.length : i
  }
  const names = found.map(t => t.table_name).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  const meta_by_table = await tables_meta(names)

  for (const table of names) {
    const meta = meta_by_table.get(table) ?? []
    const columns = meta.map(m => m.name)
    const quoted = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(', ')
    const raw = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT ${quoted} FROM "${table}"`)
    yield {
      table,
      columns,
      numericColumns: meta.filter(m => m.numeric).map(m => m.name),
      foreignKeys: {},
      rows: raw.map(r => columns.map(c => r[c])),
    }
  }
}

const utf8_bom = (s: string) => Buffer.from('﻿' + s, 'utf8')

export async function build_user_csv_zip(user_id: string): Promise<Buffer> {
  const tables = await collect_user_export(user_id)
  return build_zip(
    tables.map(t => {
      const numeric = new Set(t.numericColumns)
      return {
        name: `${t.table}.csv`,
        data: utf8_bom(
          to_csv(
            t.columns,

            t.rows.map(r => r.map((v, i) => (numeric.has(t.columns[i]) ? cell(v) : formula_guard(cell(v))))),
          ),
        ),
      }
    }),
  )
}

export async function build_user_xlsx(user_id: string): Promise<Buffer> {
  const dumps = await collect_user_export(user_id)
  const tables: XlsxTable[] = dumps.map(d => ({
    name: d.table,
    columns: d.columns.map(c => ({ name: c, numeric: d.numericColumns.includes(c), fkSheet: d.foreignKeys[c] })),
    rows: d.rows.map(r => r.map(cell)),
  }))
  return build_xlsx(tables)
}

export async function build_user_sql(user_id: string, username: string): Promise<string> {
  const tables = await collect_user_export(user_id, {})
  return build_sql_dump(tables, { title: `Ledger SQL dump — @${username} (your data only)` })
}
