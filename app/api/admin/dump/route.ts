import { NextResponse } from 'next/server'
import { formatInTimeZone } from 'date-fns-tz'
import { require_admin } from '@/app/_actions/auth'
import { collect_full_dump } from '@/app/_utils/db_export'
import { build_sql_dump } from '@/app/_utils/sql_dump'
import { USER_TIMEZONE } from '@/lib/config'
import { logger } from '@/lib/logger'

export async function GET() {
  try {
    await require_admin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const tables = await collect_full_dump()
    const sql = build_sql_dump(tables, { title: 'Ledger complete database dump — ALL users (admin)' })

    const stamp = formatInTimeZone(new Date(), USER_TIMEZONE, 'yyyy-MM-dd_HH-mm')
    return new NextResponse(sql, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="ledger-complete-${stamp}.sql"`,
      },
    })
  } catch (err) {
    logger.error({ err, route: '/api/admin/dump' }, 'Admin complete dump failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
