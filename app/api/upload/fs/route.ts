import { NextRequest, NextResponse } from 'next/server'
import { get_current_user_id } from '@/app/_actions/auth'
import { blob_driver, put_attachment } from '@/lib/blob_store'
import { content_type_for_filename, verify_attachment_bytes, MAX_ATTACHMENT_BYTES } from '@/app/_utils/attachment_content'
import { rate_limit } from '@/lib/rate_limit'
import { reportUnexpectedError } from '@/lib/action_error'

// POST /api/upload/fs?filename=<name> with the file as the raw body.
//
// The browser's way to attach a file when BLOB_STORAGE=fs. With Vercel Blob the browser uploads
// straight to Blob after a token handshake (/api/upload); here the bytes come through this server
// and land on its disk. Same rules as the MCP upload: the bytes decide the type, not the claim.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user_id = await get_current_user_id()
  if (!user_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (blob_driver() !== 'fs') return NextResponse.json({ error: 'File uploads to this server are not enabled' }, { status: 404 })
  if (!(await rate_limit(`attach_upload:${user_id}`, 60, 60)))
    return NextResponse.json({ error: 'Too many uploads — try again shortly' }, { status: 429 })

  const filename = req.nextUrl.searchParams.get('filename')?.trim() || 'file'
  const header_type = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  // Browsers leave File.type empty for some formats (HEIC); fall back to the extension.
  const declared = header_type && header_type !== 'application/octet-stream' ? header_type : (content_type_for_filename(filename) ?? header_type)

  if (Number(req.headers.get('content-length') ?? '0') > MAX_ATTACHMENT_BYTES)
    return NextResponse.json({ error: 'Attachment too large (max 10 MB)' }, { status: 413 })

  try {
    const body = Buffer.from(await req.arrayBuffer())
    const checked = verify_attachment_bytes(body, declared)
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.error.includes('too large') ? 413 : 400 })
    const stored = await put_attachment({ user_id, filename, body, content_type: checked.content_type })
    return NextResponse.json({ url: stored.url, pathname: stored.pathname, content_type: checked.content_type, size: body.length })
  } catch (e) {
    reportUnexpectedError(e, { action: 'attachment.upload', route: '/api/upload/fs', entity: 'attachment' })
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
