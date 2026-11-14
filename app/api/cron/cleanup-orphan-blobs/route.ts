import { NextResponse } from 'next/server'
import { delete_blobs, list_blobs } from '@/lib/blob_store'
import { prisma } from '@/lib/prisma'
import { check_cron_auth } from '@/lib/cron'
import { logger } from '@/lib/logger'

const GRACE_MS = 60 * 60 * 1000

export async function GET(request: Request) {
  const denied = check_cron_auth(request, '/api/cron/cleanup-orphan-blobs')
  if (denied) return denied

  try {
    const referenced = new Set((await prisma.transaction_attachment.findMany({ select: { pathname: true } })).map(a => a.pathname))

    const now = Date.now()
    const blobs = await list_blobs()
    const scanned = blobs.length
    const orphan_pathnames: string[] = []
    for (const blob of blobs) {
      if (referenced.has(blob.pathname)) continue
      if (now - blob.uploadedAt.getTime() < GRACE_MS) continue
      orphan_pathnames.push(blob.pathname)
    }

    await delete_blobs(orphan_pathnames)

    logger.info({ scanned, deleted: orphan_pathnames.length }, 'orphan-blob cleanup complete')
    return NextResponse.json({ success: true, scanned, deleted: orphan_pathnames.length })
  } catch (error) {
    logger.error({ err: error, route: '/api/cron/cleanup-orphan-blobs' }, 'CRON cleanup-orphan-blobs failed')
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
