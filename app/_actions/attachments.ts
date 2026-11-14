'use server'

import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { delete_blobs, is_trusted_blob_ref } from '@/lib/blob_store'
import { ActionResult, ok, err } from './_result'
import { reportActionError } from '@/lib/action_error'
import { audit } from '@/lib/logger'

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
    if (!user_id) return err('UNAUTHORIZED', 'Your session has expired — log in again')

    const tx = await prisma.transaction.findUnique({ where: { id: transaction_id, user_id } })
    if (!tx) return err('NOT_FOUND', 'Transaction not found')

    const trusted = await Promise.all(attachments.map(a => is_trusted_blob_ref(a.url, a.pathname, user_id)))
    if (trusted.some(t => !t)) return err('VALIDATION', 'Invalid attachment reference')

    await prisma.transaction_attachment.createMany({
      data: attachments.map(a => ({ transaction_id, ...a })),
    })
    audit('attachment.save', user_id, { attachment_count: attachments.length })
    return ok()
  } catch (error) {
    return reportActionError(error, { action: 'attachment.save' })
  }
}

export async function delete_attachment(attachment_id: string): Promise<ActionResult> {
  try {
    const user_id = await get_current_user_id()
    if (!user_id) return err('UNAUTHORIZED', 'Your session has expired — log in again')

    const attachment = await prisma.transaction_attachment.findUnique({
      where: { id: attachment_id },
      include: { transaction: true },
    })
    if (!attachment || attachment.transaction.user_id !== user_id) return err('NOT_FOUND', 'Attachment not found')

    await delete_blobs([attachment.url])
    await prisma.transaction_attachment.delete({ where: { id: attachment_id } })
    audit('attachment.delete', user_id)
    return ok()
  } catch (error) {
    return reportActionError(error, { action: 'attachment.delete' })
  }
}
