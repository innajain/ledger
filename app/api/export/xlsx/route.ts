import { NextResponse } from 'next/server'
import { formatInTimeZone } from 'date-fns-tz'
import { get_current_user } from '@/app/_actions/auth'
import { collect_user_export, cell } from '@/app/_utils/db_export'
import { build_xlsx, type XlsxTable } from '@/app/_utils/xlsx'
import { USER_TIMEZONE } from '@/lib/config'
import { logger } from '@/lib/logger'

// A single linked .xlsx workbook: one sheet per table (scoped to the caller, via
// db_export.ts), with every foreign-key cell hyperlinked to the referenced row
// on its table's sheet. The Excel counterpart to the CSV-zip at /api/export.

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function GET() {
  try {
    const user = await get_current_user()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const dumps = await collect_user_export(user.id)
    const tables: XlsxTable[] = dumps.map(d => ({
      name: d.table,
      columns: d.columns.map(c => ({ name: c, numeric: d.numericColumns.includes(c), fkSheet: d.foreignKeys[c] })),
      rows: d.rows.map(r => r.map(cell)),
    }))
    const xlsx = build_xlsx(tables)

    const stamp = formatInTimeZone(new Date(), USER_TIMEZONE, 'yyyy-MM-dd_HH-mm')
    return new NextResponse(new Uint8Array(xlsx), {
      status: 200,
      headers: {
        'Content-Type': XLSX_CONTENT_TYPE,
        'Content-Disposition': `attachment; filename="ledger-export-${stamp}.xlsx"`,
        'Content-Length': String(xlsx.length),
      },
    })
  } catch (err) {
    logger.error({ err, route: '/api/export/xlsx' }, 'Excel export failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
