import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { get_current_user } from '@/app/_actions/auth';

// Allowlist of table names to prevent SQL injection
const ALLOWED_TABLES = ['user', 'account', 'asset', 'transaction', 'line_item', '_prisma_migrations'];

export async function GET() {
  try {
    // Authorization check - require authentication
    const user = await get_current_user();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const sql = neon(process.env.DATABASE_URL!);
    
    // Get all table names
    const tables = await sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `;

    let dump = '-- Database Dump\n\n';

    // Export each table
    for (const { tablename } of tables) {
      // Validate table name against allowlist to prevent SQL injection
      if (!ALLOWED_TABLES.includes(tablename)) {
        console.warn(`Skipping unknown table: ${tablename}`);
        continue;
      }
      
      // Use parameterized approach - table name is validated above
      let rows: Record<string, unknown>[];
      switch (tablename) {
        case 'user':
          rows = await sql`SELECT * FROM "user"`;
          break;
        case 'account':
          rows = await sql`SELECT * FROM "account"`;
          break;
        case 'asset':
          rows = await sql`SELECT * FROM "asset"`;
          break;
        case 'transaction':
          rows = await sql`SELECT * FROM "transaction"`;
          break;
        case 'line_item':
          rows = await sql`SELECT * FROM "line_item"`;
          break;
        case '_prisma_migrations':
          rows = await sql`SELECT * FROM "_prisma_migrations"`;
          break;
        default:
          continue;
      }
      
      dump += `-- Table: ${tablename}\n`;
      dump += `CREATE TABLE IF NOT EXISTS "${tablename}" (...); -- Add schema\n`;
      
      for (const row of rows) {
        const values = Object.values(row)
          .map(v => {
            if (v === null) return 'NULL';
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
            if (v instanceof Date) return `'${v.toISOString()}'`;
            return String(v);
          })
          .join(', ');
        dump += `INSERT INTO "${tablename}" VALUES (${values});\n`;
      }
      dump += '\n';
    }

    const now = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `db-${now}.sql`;

    return new NextResponse(dump, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err: unknown) {
    console.error('Database dump error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}