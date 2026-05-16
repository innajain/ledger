import { NextRequest, NextResponse } from 'next/server'
import { get_current_user } from '@/app/_actions/auth'
import { get_signed_put_url } from '@/app/_utils/s3'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'application/pdf', 'text/plain']
const MAX_SIZE = 10 * 1024 * 1024

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await get_current_user()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { filename, content_type, size } = (await req.json()) as { filename: string; content_type: string; size: number }

  if (size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(content_type)) return NextResponse.json({ error: `File type not allowed: ${content_type}` }, { status: 400 })

  const pathname = `attachments/${user.id}/${Date.now()}-${filename}`
  const presigned_url = await get_signed_put_url(pathname, content_type)

  return NextResponse.json({ presigned_url, pathname })
}
