import { get } from '@vercel/blob'
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

  const result = await get(att.pathname, { access: 'private' })
  if (!result || result.statusCode !== 200) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return new Response(result.stream, {
    headers: {
      'Content-Type': att.content_type ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
