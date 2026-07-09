import { NextResponse } from 'next/server'
import { formatInTimeZone } from 'date-fns-tz'
import { get_current_user } from '@/app/_actions/auth'
import { build_user_csv_zip } from '@/app/_utils/db_export'
import { USER_TIMEZONE } from '@/lib/config'
import { logger } from '@/lib/logger'

export async function GET() {
  try {
    const user = await get_current_user()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const zip = await build_user_csv_zip(user.id)

    const stamp = formatInTimeZone(new Date(), USER_TIMEZONE, 'yyyy-MM-dd_HH-mm')
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="ledger-export-${stamp}.zip"`,
        'Content-Length': String(zip.length),
      },
    })
  } catch (err) {
    logger.error({ err, route: '/api/export' }, 'CSV export failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
