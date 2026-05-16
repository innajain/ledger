import { put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'
import { get_current_user } from '@/app/_actions/auth'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'application/pdf', 'text/plain']
const MAX_SIZE = 10 * 1024 * 1024

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await get_current_user()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const filename = req.headers.get('x-filename') ?? 'upload'
  const content_type = req.headers.get('x-content-type') ?? req.headers.get('content-type') ?? 'application/octet-stream'
  const size = Number(req.headers.get('x-file-size') ?? '0')

  if (!ALLOWED_TYPES.includes(content_type)) return NextResponse.json({ error: `File type not allowed: ${content_type}` }, { status: 400 })
  if (size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })
  if (!req.body) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const pathname = `attachments/${Date.now()}-${filename}`
  const blob = await put(pathname, req.body, { access: 'public', contentType: content_type })

  return NextResponse.json({
    url: blob.url,
    pathname: blob.pathname,
    filename,
    content_type,
    size,
  })
}
