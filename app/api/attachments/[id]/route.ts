import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user_id = await get_current_user_id()
  if (!user_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const att = await prisma.transaction_attachment.findUnique({
    where: { id },
    include: { transaction: true },
  })
  if (!att || att.transaction.user_id !== user_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // The DB stores the URL the blob was put() against. In dev, sync-db copies
  // the DB rows verbatim from prod, so `att.url` points at the prod blob's
  // `.private.blob.vercel-storage.com` host even though the bytes now live
  // on the local emulator. Rewrite to the emulator's origin + pathname when
  // VERCEL_BLOB_API_URL is set; in prod this var is unset and we fetch the
  // original URL.
  const fetch_url = process.env.VERCEL_BLOB_API_URL ? `${new URL(process.env.VERCEL_BLOB_API_URL).origin}/${att.pathname}` : att.url
  const response = await fetch(fetch_url, {
    headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  })
  if (!response.ok || !response.body) return NextResponse.json({ error: 'Blob fetch failed', status: response.status }, { status: 502 })

  return new Response(response.body, {
    headers: {
      'Content-Type': att.content_type ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
