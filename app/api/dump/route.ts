import { exec } from 'child_process';
import { NextResponse } from 'next/server';
import { promisify } from 'util';
const execAsync = promisify(exec);

export async function GET() {
  try {
    // Create dump
    await execAsync(`pg_dump "${process.env.DATABASE_URL}" > /tmp/db.sql`);

    // Read dump
    const fs = await import('fs');
    const file = fs.readFileSync('/tmp/db.sql');

    const now = new Date().toISOString().replace(/[:.]/g, '-'); // because Windows is a crybaby
    const fileName = `db-${now}.sql`;

    return new NextResponse(file, {
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
