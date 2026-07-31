import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextRequest, NextResponse } from 'next/server'
import { get_current_user } from '@/app/_actions/auth'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'application/pdf', 'text/plain', 'application/json']

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await get_current_user()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_TYPES,
        maximumSizeInBytes: 10 * 1024 * 1024,
      }),
    })
    return NextResponse.json(jsonResponse)
  } catch (e) {
    console.error('[upload] handleUpload failed:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
