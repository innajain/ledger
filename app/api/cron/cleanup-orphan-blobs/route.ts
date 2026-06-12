import { NextResponse } from 'next/server'
import { list, del } from '@vercel/blob'
import { prisma } from '@/lib/prisma'
import { check_cron_auth } from '@/lib/cron'
import { logger } from '@/lib/logger'

// Grace period: don't delete a blob that's been uploaded within this window —
// covers the race between client uploading and the server action saving the DB row.
const GRACE_MS = 60 * 60 * 1000 // 1 hour

export async function GET(request: Request) {
  const denied = check_cron_auth(request, '/api/cron/cleanup-orphan-blobs')
  if (denied) return denied

  try {
    const referenced = new Set((await prisma.transaction_attachment.findMany({ select: { pathname: true } })).map(a => a.pathname))

    const now = Date.now()
    let cursor: string | undefined
    let scanned = 0
    const orphan_pathnames: string[] = []
    do {
      const page = await list({ cursor, limit: 1000 })
      scanned += page.blobs.length
      for (const blob of page.blobs) {
        if (referenced.has(blob.pathname)) continue
        if (now - blob.uploadedAt.getTime() < GRACE_MS) continue
        orphan_pathnames.push(blob.pathname)
      }
      cursor = page.cursor
    } while (cursor)

    if (orphan_pathnames.length > 0) {
      await del(orphan_pathnames)
    }

    logger.info({ scanned, deleted: orphan_pathnames.length }, 'orphan-blob cleanup complete')
    return NextResponse.json({ success: true, scanned, deleted: orphan_pathnames.length })
  } catch (error) {
    logger.error({ err: error, route: '/api/cron/cleanup-orphan-blobs' }, 'CRON cleanup-orphan-blobs failed')
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
