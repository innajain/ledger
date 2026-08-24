import { NextResponse } from 'next/server'
import { formatInTimeZone } from 'date-fns-tz'
import { require_admin } from '@/app/_actions/auth'
import { collect_full_dump_tables, type TableExport } from '@/app/_utils/db_export'
import { sql_dump_header, sql_table_chunk } from '@/app/_utils/sql_dump'
import { USER_TIMEZONE } from '@/lib/config'
import { logger } from '@/lib/logger'

export async function GET() {
  try {
    await require_admin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Streamed one table at a time: the metrics tables grow without bound, so the
  // full dump must never be materialized as a single in-memory string.
  const tables = collect_full_dump_tables()

  // Prime the first table before sending headers so an outright DB failure
  // still returns a 500 instead of truncating a 200 stream.
  let pending: IteratorResult<TableExport, void> | null
  try {
    pending = await tables.next()
  } catch (err) {
    logger.error({ err, route: '/api/admin/dump' }, 'Admin complete dump failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const encoder = new TextEncoder()
  let sentHeader = false
  let tableCount = 0
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!sentHeader) {
          sentHeader = true
          controller.enqueue(encoder.encode(sql_dump_header({ title: 'Ledger complete database dump — ALL users (admin)' })))
          return
        }
        const next = pending ?? (await tables.next())
        pending = null
        if (next.done) {
          // Chunks end exactly on table boundaries, so without a trailer a mid-stream
          // failure would be indistinguishable from a complete dump.
          controller.enqueue(encoder.encode(`\n-- dump complete (${tableCount} tables)\n`))
          controller.close()
        } else {
          tableCount++
          controller.enqueue(encoder.encode('\n' + sql_table_chunk(next.value)))
        }
      } catch (err) {
        logger.error({ err, route: '/api/admin/dump' }, 'Admin complete dump failed mid-stream')
        controller.error(err)
      }
    },
    cancel() {
      void tables.return(undefined)
    },
  })

  const stamp = formatInTimeZone(new Date(), USER_TIMEZONE, 'yyyy-MM-dd_HH-mm')
  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/sql; charset=utf-8',
      'Content-Disposition': `attachment; filename="ledger-complete-${stamp}.sql"`,
    },
  })
}
