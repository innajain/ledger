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

export function sql_dump_header(opts: { title: string; generatedAt?: Date }): string {
  return [
    `-- ${opts.title}`,
    `-- Generated ${(opts.generatedAt ?? new Date()).toISOString()}`,
    `-- Data only — the schema is managed by Prisma migrations. When restoring`,
    `-- into a database that enforces foreign keys, disable them for the load, e.g.:`,
    `--   SET session_replication_role = replica;   -- (requires a privileged role)`,
    '',
  ].join('\n')
}

export function sql_table_chunk(t: SqlTable): string {
  const out: string[] = [`-- Table: ${t.table} (${t.rows.length} ${t.rows.length === 1 ? 'row' : 'rows'})`]
  const numeric = new Set(t.numericColumns ?? [])
  const colList = t.columns.map(ident).join(', ')
  for (const row of t.rows) {
    const values = t.columns.map((c, i) => literal(row[i], numeric.has(c))).join(', ')
    out.push(`INSERT INTO ${ident(t.table)} (${colList}) VALUES (${values});`)
  }
  out.push('')
  return out.join('\n')
}

// Streaming callers emit sql_dump_header once, then '\n' + sql_table_chunk per
// table — that concatenation is byte-identical to this joined form.
export function build_sql_dump(tables: SqlTable[], opts: { title: string; generatedAt?: Date }): string {
  return [sql_dump_header(opts), ...tables.map(sql_table_chunk)].join('\n')
}
