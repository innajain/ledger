import { NextRequest, NextResponse } from 'next/server'
import { get_current_user_id } from '@/app/_actions/auth'
import { blob_driver, fs_user_prefix, read_attachment } from '@/lib/blob_store'
import { content_type_for_filename, sniff_binary_type } from '@/app/_utils/attachment_content'

// GET /api/files/<pathname> — a file this user uploaded, when BLOB_STORAGE=fs.
//
// Ownership is the path itself (attachments/<user id>/...), so a file can be previewed right after
// upload, before any attachment record exists. Saved attachments are also reachable through
// /api/attachments/<id>, which is what the transaction pages link to.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ pathname: string[] }> }) {
  const user_id = await get_current_user_id()
  if (!user_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (blob_driver() !== 'fs') return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const pathname = (await params).pathname.join('/')
  if (!pathname.startsWith(fs_user_prefix(user_id)) || pathname.includes('..')) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const bytes = await read_attachment({ url: '', pathname })
  if (!bytes) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const content_type = sniff_binary_type(bytes) ?? content_type_for_filename(pathname) ?? 'application/octet-stream'
  return new Response(new Uint8Array(bytes), {
    headers: { 'Content-Type': content_type, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
  })
}
