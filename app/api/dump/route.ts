import { NextResponse } from 'next/server'
import { formatInTimeZone } from 'date-fns-tz'
import { get_current_user } from '@/app/_actions/auth'
import { build_user_sql } from '@/app/_utils/db_export'
import { USER_TIMEZONE } from '@/lib/config'
import { logger } from '@/lib/logger'

export async function GET() {
  try {
    const user = await get_current_user()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sql = await build_user_sql(user.id, user.username)

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
