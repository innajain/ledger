export type SqlTable = {
  table: string
  columns: string[]
  rows: unknown[][]
  numericColumns?: string[]
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`

function literal(v: unknown, numeric: boolean): string {
  if (v === null || v === undefined) return 'NULL'
  if (v instanceof Date) return `'${v.toISOString()}'`
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'

  if (numeric || typeof v === 'number' || typeof v === 'bigint') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

export function build_sql_dump(tables: SqlTable[], opts: { title: string; generatedAt?: Date }): string {
  const out: string[] = [
    `-- ${opts.title}`,
    `-- Generated ${(opts.generatedAt ?? new Date()).toISOString()}`,
    `-- Data only — the schema is managed by Prisma migrations. When restoring`,
    `-- into a database that enforces foreign keys, disable them for the load, e.g.:`,
    `--   SET session_replication_role = replica;   -- (requires a privileged role)`,
    '',
  ]
  for (const t of tables) {
    out.push(`-- Table: ${t.table} (${t.rows.length} ${t.rows.length === 1 ? 'row' : 'rows'})`)
    const numeric = new Set(t.numericColumns ?? [])
    const colList = t.columns.map(ident).join(', ')
    for (const row of t.rows) {
      const values = t.columns.map((c, i) => literal(row[i], numeric.has(c))).join(', ')
      out.push(`INSERT INTO ${ident(t.table)} (${colList}) VALUES (${values});`)
    }
    out.push('')
  }
  return out.join('\n')
}
