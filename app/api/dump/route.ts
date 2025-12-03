import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  try {
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
      // Create a TemplateStringsArray manually
      const query = Object.assign(
        [`SELECT * FROM ${tablename}`],
        { raw: [`SELECT * FROM ${tablename}`] }
      ) as unknown as TemplateStringsArray;
      
      const rows = await sql(query);
      
      dump += `-- Table: ${tablename}\n`;
      dump += `CREATE TABLE IF NOT EXISTS ${tablename} (...); -- Add schema\n`;
      
      for (const row of rows) {
        const values = Object.values(row)
          .map(v => typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v)
          .join(', ');
        dump += `INSERT INTO ${tablename} VALUES (${values});\n`;
      }
      dump += '\n';
    }

    const now = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `db-${now}.sql`;

    return new NextResponse(dump, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename=${fileName}`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}