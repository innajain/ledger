'use server'

import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { delete_object } from '@/app/_utils/s3'
import { ActionResult, ok, err, fromError } from './_result'

export type AttachmentInput = {
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

    await delete_object(attachment.pathname)
    await prisma.transaction_attachment.delete({ where: { id: attachment_id } })
    return ok()
  } catch (error) {
    return fromError(error)
  }
}
