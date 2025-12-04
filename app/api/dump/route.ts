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
    // If email env vars are set, send the dump via SendGrid
    const toEmail = process.env.DUMP_EMAIL_TO;
    const sendgridKey = process.env.SENDGRID_API_KEY;

    if (toEmail && sendgridKey) {
      try {
        const dumpBuffer = Buffer.from(dump, 'utf8');
        // SendGrid has attachment size limits (~30MB); guard against huge dumps
        const MAX_ATTACHMENT = 30 * 1024 * 1024;
        if (dumpBuffer.length > MAX_ATTACHMENT) {
          return NextResponse.json({ error: 'Dump too large to send by email' }, { status: 413 });
        }

        const payload = {
          personalizations: [
            {
              to: [{ email: toEmail }],
              subject: `Database dump ${fileName}`,
            },
          ],
          from: { email: process.env.DUMP_EMAIL_FROM ?? `no-reply@${process.env.VERCEL_URL ?? 'localhost'}` },
          content: [{ type: 'text/plain', value: 'Attached database dump (SQL).' }],
          attachments: [
            {
              content: dumpBuffer.toString('base64'),
              filename: fileName,
              type: 'application/sql',
              disposition: 'attachment',
            },
          ],
        };

        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sendgridKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const text = await res.text();
          return NextResponse.json({ error: 'SendGrid send failed', detail: text }, { status: 502 });
        }

        return NextResponse.json({ ok: true, sent: true });
      } catch (e: any) {
        return NextResponse.json({ error: 'Failed to send dump by email', detail: e?.message ?? String(e) }, { status: 500 });
      }
    }

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