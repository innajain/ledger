import { NextResponse } from 'next/server'
import { formatInTimeZone } from 'date-fns-tz'
import { get_current_user } from '@/app/_actions/auth'
import { collect_user_export, cell } from '@/app/_utils/db_export'
import { to_csv, formula_guard } from '@/app/_utils/csv'
import { build_zip } from '@/app/_utils/zip'
import { USER_TIMEZONE } from '@/lib/config'
import { logger } from '@/lib/logger'

// One CSV per table, each scoped to the signed-in user's own rows — raw columns,
// as stored. The per-user counterpart to the user-scoped SQL dump at /api/dump.
// See the linked Excel variant at /api/export/xlsx. Scoping lives in db_export.ts.

// Excel only auto-detects UTF-8 when the file leads with a BOM.
const utf8 = (s: string) => Buffer.from('﻿' + s, 'utf8')

export async function GET() {
  try {
    const user = await get_current_user()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tables = await collect_user_export(user.id)
    const zip = build_zip(
      tables.map(t => {
        const numeric = new Set(t.numericColumns)
        return {
          name: `${t.table}.csv`,
          data: utf8(
            to_csv(
              t.columns,
              // Guard textual columns against spreadsheet formula injection; numeric
              // columns are left as-is (a legitimate value may start with '-').
              t.rows.map(r => r.map((v, i) => (numeric.has(t.columns[i]) ? cell(v) : formula_guard(cell(v))))),
            ),
          ),
        }
      }),
    )

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
