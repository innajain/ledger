import { NextResponse } from 'next/server'
import { neon, NeonQueryFunction } from '@neondatabase/serverless'
import { get_current_user } from '@/app/_actions/auth'
import { env, isDev } from '@/lib/env'
import { logger } from '@/lib/logger'

// Table query functions - each query is pre-defined to prevent SQL injection.
// The switch statement pattern is intentional: it ensures table names are never
// dynamically interpolated into SQL, which is the most secure approach.
type TableQueryFn = (sql: NeonQueryFunction<false, false>) => Promise<Record<string, unknown>[]>

const TABLE_QUERIES: Record<string, TableQueryFn> = {
  user: sql => sql`SELECT * FROM "user"`,
  account: sql => sql`SELECT * FROM "account"`,
  asset: sql => sql`SELECT * FROM "asset"`,
  transaction: sql => sql`SELECT * FROM "transaction"`,
  line_item: sql => sql`SELECT * FROM "line_item"`,
  _prisma_migrations: sql => sql`SELECT * FROM "_prisma_migrations"`,
}

// Helper function to escape SQL identifier (column/table names)
function escapeIdentifier(identifier: string): string {
  // Double quotes escape for PostgreSQL identifiers
  return `"${identifier.replace(/"/g, '""')}"`
}

export async function GET() {
  try {
    // Authorization check - require authentication
    const user = await get_current_user()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sql = neon(env.DATABASE_URL)

    // Get all table names
    const tables = await sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `

    let dump = '-- Database Dump\n\n'

    // Export each table
    for (const { tablename } of tables) {
      // Validate table name against allowlist to prevent SQL injection
      const queryFn = TABLE_QUERIES[tablename]
      if (!queryFn) {
        // Skip tables not in our allowlist - this is intentional for security
        continue
      }

      const rows = await queryFn(sql)

      dump += `-- Table: ${tablename}\n`
      // Note: Schema definitions should be handled by Prisma migrations
      // This dump only contains data for backup/restore purposes

      for (const row of rows) {
        // Use explicit column names to ensure correct column order during restore
        const columnNames = Object.keys(row).map(escapeIdentifier).join(', ')
        const values = Object.values(row)
          .map(v => {
            if (v === null) return 'NULL'
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
            if (v instanceof Date) return `'${v.toISOString()}'`
            return String(v)
          })
          .join(', ')
        dump += `INSERT INTO "${tablename}" (${columnNames}) VALUES (${values});\n`
      }
      dump += '\n'
    }

    // Generate sanitized filename using simple date format
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`
    const fileName = `db-${dateStr}_${timeStr}.sql`

    return new NextResponse(dump, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err: unknown) {
    // Log error for debugging but don't expose details to client
    if (isDev()) {
      logger.error({ err, route: '/api/dump' }, 'Database dump error')
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
