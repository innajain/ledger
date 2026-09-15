import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { rate_limit } from '@/lib/rate_limit'
import { audit, logger } from '@/lib/logger'
import { claim_upload_grant, release_upload_grant } from '@/lib/mcp/attachment_upload'
import { verify_attachment_bytes, MAX_ATTACHMENT_BYTES } from '@/app/_utils/attachment_content'
import { reportUnexpectedError } from '@/lib/action_error'

// PUT /api/mcp/upload/<token>
//
// The bytes half of the MCP attachment flow: request_attachment_upload mints a
// one-time token, the agent pipes the file here with curl, and the file never
// passes through a tool argument. The token *is* the credential (an MCP client
// holds its bearer token privately, so the model can't forward it), which is
// why the grant is single-use, ten-minute, and bound to one transaction.

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!(await rate_limit(`mcp_upload:${ip}`, 20, 60))) {
    return NextResponse.json({ error: 'Too many uploads — try again shortly' }, { status: 429 })
  }

  const claim = await claim_upload_grant(token)
  if (!claim.ok) return NextResponse.json({ error: claim.error }, { status: 404 })
  const grant = claim.grant

  try {
    // Reject on the declared length before reading anything, so an oversized
    // body is refused rather than buffered.
    const declared_length = Number(req.headers.get('content-length') ?? '0')
    if (declared_length > MAX_ATTACHMENT_BYTES) {
      await release_upload_grant(grant.id)
      return NextResponse.json({ error: 'Attachment too large (max 10 MB)' }, { status: 413 })
    }

    const body = Buffer.from(await req.arrayBuffer())
    // content-length is a claim too; the real length is what we just read.
    if (body.length > MAX_ATTACHMENT_BYTES) {
      await release_upload_grant(grant.id)
      return NextResponse.json({ error: 'Attachment too large (max 10 MB)' }, { status: 413 })
    }

    const checked = verify_attachment_bytes(body, grant.content_type)
    if (!checked.ok) {
      await release_upload_grant(grant.id)
      return NextResponse.json({ error: checked.error }, { status: 400 })
    }

    // The grant was bound to this transaction at creation; re-check that it
    // still exists and still belongs to the same user before writing.
    const tx = await prisma.transaction.findFirst({
      where: { id: grant.transaction_id, user_id: grant.user_id },
      select: { id: true },
    })
    if (!tx) {
      await release_upload_grant(grant.id)
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    if (!env.BLOB_READ_WRITE_TOKEN) {
      await release_upload_grant(grant.id)
      return NextResponse.json({ error: 'Blob storage is not configured on this server' }, { status: 500 })
    }

    const blob = await put(`attachments/${Date.now()}-${grant.filename}`, body, {
      access: 'private',
      contentType: checked.content_type,
    })

    const att = await prisma.transaction_attachment.create({
      data: {
        transaction_id: tx.id,
        url: blob.url,
        pathname: blob.pathname,
        filename: grant.filename,
        content_type: checked.content_type,
        size: body.length,
      },
    })

    audit('attachment.save', grant.user_id, { attachment_count: 1, surface: 'mcp_upload' })
    return NextResponse.json({
      ok: true,
      attachment_id: att.id,
      filename: grant.filename,
      content_type: checked.content_type,
      size: body.length,
      message: 'Attachment saved',
    })
  } catch (e) {
    // Let the agent retry the same URL rather than stranding the grant.
    await release_upload_grant(grant.id).catch(() => {})
    reportUnexpectedError(e, { action: 'attachment.upload', route: '/api/mcp/upload/[token]', entity: 'attachment' })
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

// Anything other than PUT is a caller mistake worth naming explicitly — a POST
// here would otherwise 405 with no hint about the right verb.
export function GET() {
  logger.info({ event: 'operation.rejected', action: 'attachment.upload', reason: 'wrong_method' }, 'upload endpoint called with GET')
  return NextResponse.json({ error: 'Use PUT to upload the file bytes to this URL' }, { status: 405 })
}
