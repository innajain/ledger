export type ActionErrorCode = 'VALIDATION' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'SERVER'

export type ActionResult<T = void> = { success: true; message?: string; data?: T } | { success: false; code: ActionErrorCode; message: string }

export function ok<T = void>(data?: T, message?: string): ActionResult<T> {
  return { success: true, ...(data !== undefined ? { data } : {}), ...(message !== undefined ? { message } : {}) }
}

export function err(code: ActionErrorCode, message: string): ActionResult<never> {
  return { success: false, code, message }
}

export class ActionError extends Error {
  code: ActionErrorCode
  constructor(code: ActionErrorCode, message: string) {
    super(message)
    this.name = 'ActionError'
    this.code = code
  }
}

export function fromError(error: unknown, fallback: ActionErrorCode = 'SERVER'): ActionResult<never> {
  if (error instanceof ActionError) return err(error.code, error.message)
  if (error && typeof error === 'object' && 'code' in error) {
    const prismaCode = (error as { code: unknown }).code
    if (prismaCode === 'P2002') return err('VALIDATION', 'A record with this name already exists')
    if (prismaCode === 'P2003') return err('SERVER', 'Cannot delete: this item is still referenced by other records')
    if (prismaCode === 'P2025') return err('NOT_FOUND', 'Record not found')
  }
  const detail = error instanceof Error ? error.message : String(error)

  const message = fallback === 'SERVER' && process.env.NODE_ENV === 'production' ? 'Something went wrong. Please try again.' : detail
  return { success: false, code: fallback, message }
}
