import { NextResponse } from 'next/server'
import { formatInTimeZone } from 'date-fns-tz'
import { get_current_user } from '@/app/_actions/auth'
import { collect_user_export } from '@/app/_utils/db_export'
import { build_sql_dump } from '@/app/_utils/sql_dump'
import { USER_TIMEZONE } from '@/lib/config'
import { logger } from '@/lib/logger'

// User-scoped SQL dump: the signed-in user's own rows across every table that
// holds their data, as data-only INSERT statements. A restorable backup, so —
// unlike the CSV/Excel exports — it keeps every column (incl. the owner's own
// password_hash) by passing no exclusions. The admin-only whole-DB dump lives
// at /api/admin/dump.

export async function GET() {
  try {
    const user = await get_current_user()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tables = await collect_user_export(user.id, {})
    const sql = build_sql_dump(tables, { title: `Ledger SQL dump — @${user.username} (your data only)` })

    const stamp = formatInTimeZone(new Date(), USER_TIMEZONE, 'yyyy-MM-dd_HH-mm')
    const safeName = user.username.replace(/[^a-zA-Z0-9_-]/g, '_')
    return new NextResponse(sql, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="ledger-${safeName}-${stamp}.sql"`,
      },
    })
  } catch (err) {
    logger.error({ err, route: '/api/dump' }, 'User SQL dump failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
