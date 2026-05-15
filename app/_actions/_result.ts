/**
 * Discriminated result type for server actions.
 *
 * Existing callers that only check `result.success` and read `result.message`
 * keep working. New callers that want to distinguish error categories (auth
 * vs. validation vs. server) can switch on `code`.
 */
export type ActionErrorCode = 'VALIDATION' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'SERVER'

export type ActionResult<T = void> = { success: true; message?: string; data?: T } | { success: false; code: ActionErrorCode; message: string }

export function ok<T = void>(data?: T, message?: string): ActionResult<T> {
  return { success: true, ...(data !== undefined ? { data } : {}), ...(message !== undefined ? { message } : {}) }
}

export function err(code: ActionErrorCode, message: string): ActionResult<never> {
  return { success: false, code, message }
}

/**
 * Map an unknown thrown value to an ActionResult error. Defaults to SERVER
 * unless a code is supplied. Use in catch blocks.
 *
 * Handles Prisma PrismaClientKnownRequestError codes by duck-typing the `code`
 * property so we don't need to import the Prisma client here.
 */
export function fromError(error: unknown, fallback: ActionErrorCode = 'SERVER'): ActionResult<never> {
  if (error && typeof error === 'object' && 'code' in error) {
    const prismaCode = (error as { code: unknown }).code
    if (prismaCode === 'P2002') return err('VALIDATION', 'A record with this name already exists')
    if (prismaCode === 'P2003') return err('SERVER', 'Cannot delete: this item is still referenced by other records')
    if (prismaCode === 'P2025') return err('NOT_FOUND', 'Record not found')
  }
  const message = error instanceof Error ? error.message : String(error)
  return { success: false, code: fallback, message }
}
