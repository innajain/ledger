'use server'

import { del } from '@vercel/blob'
import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { env } from '@/lib/env'
import { ActionResult, ok, err, fromError } from './_result'

// `url`/`pathname` are client-supplied and the serving route fetches them with the
// blob read/write token, so an off-store reference must never be persisted. The
// route re-validates at read time; this is defense in depth at write time.
function is_trusted_blob_ref(url: string, pathname: string): boolean {
  if (!pathname || pathname.includes('..')) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  // The dev emulator can mint non-vercel-storage origins; only enforce the host in prod.
  if (env.NEXT_PUBLIC_VERCEL_BLOB_API_URL) return true
  return parsed.protocol === 'https:' && (parsed.hostname === 'blob.vercel-storage.com' || parsed.hostname.endsWith('.blob.vercel-storage.com'))
}

export type AttachmentInput = {
  url: string
  pathname: string
  filename: string
  content_type: string | null
  size: number | null
}

export async function save_attachments(transaction_id: string, attachments: AttachmentInput[]): Promise<ActionResult> {
  try {
    if (attachments.length === 0) return ok()
    const user_id = await get_current_user_id()
    if (!user_id) return err('UNAUTHORIZED', 'unauthorized')

    const tx = await prisma.transaction.findUnique({ where: { id: transaction_id, user_id } })
    if (!tx) return err('NOT_FOUND', 'Transaction not found')

    if (attachments.some(a => !is_trusted_blob_ref(a.url, a.pathname))) return err('VALIDATION', 'Invalid attachment reference')

    await prisma.transaction_attachment.createMany({
      data: attachments.map(a => ({ transaction_id, ...a })),
    })
    return ok()
  } catch (error) {
    return fromError(error)
  }
}

export async function delete_attachment(attachment_id: string): Promise<ActionResult> {
  try {
    const user_id = await get_current_user_id()
    if (!user_id) return err('UNAUTHORIZED', 'unauthorized')

    const attachment = await prisma.transaction_attachment.findUnique({
      where: { id: attachment_id },
      include: { transaction: true },
    })
    if (!attachment || attachment.transaction.user_id !== user_id) return err('NOT_FOUND', 'Attachment not found')

    await del(attachment.url)
    await prisma.transaction_attachment.delete({ where: { id: attachment_id } })
    return ok()
  } catch (error) {
    return fromError(error)
  }
}
