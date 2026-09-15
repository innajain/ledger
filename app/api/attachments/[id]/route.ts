import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

const BLOB_HOST_SUFFIX = '.blob.vercel-storage.com'

function resolve_blob_fetch_url(att_url: string, pathname: string): string | null {
  if (env.NEXT_PUBLIC_VERCEL_BLOB_API_URL) {
    return `${new URL(env.NEXT_PUBLIC_VERCEL_BLOB_API_URL).origin}/${pathname}`
  }
  let parsed: URL
  try {
    parsed = new URL(att_url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (parsed.hostname !== 'blob.vercel-storage.com' && !parsed.hostname.endsWith(BLOB_HOST_SUFFIX)) return null
  return parsed.toString()
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user_id = await get_current_user_id()
  if (!user_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const att = await prisma.transaction_attachment.findUnique({
    where: { id },
    include: { transaction: true },
  })
  if (!att || att.transaction.user_id !== user_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const fetch_url = resolve_blob_fetch_url(att.url, att.pathname)
  if (!fetch_url) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const response = await fetch(fetch_url, {
    headers: { authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` },
  })
  if (!response.ok || !response.body) {
    logger.warn(
      { event: 'operation.degraded', action: 'attachment.download', route: '/api/attachments/[id]', upstream_status: response.status },
      'blob fetch failed',
    )
    return NextResponse.json({ error: 'Blob fetch failed', status: response.status }, { status: 502 })
  }

  return new Response(response.body, {
    headers: {
      'Content-Type': att.content_type ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
