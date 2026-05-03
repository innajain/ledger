/**
 * Discriminated result type for server actions.
 *
 * Existing callers that only check `result.success` and read `result.message`
 * keep working. New callers that want to distinguish error categories (auth
 * vs. validation vs. server) can switch on `code`.
 */
export type ActionErrorCode = 'VALIDATION' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'SERVER'

export type ActionResult<T = void> =
  | { success: true; message?: string; data?: T }
  | { success: false; code: ActionErrorCode; message: string }

export function ok<T = void>(data?: T, message?: string): ActionResult<T> {
  return { success: true, ...(data !== undefined ? { data } : {}), ...(message !== undefined ? { message } : {}) }
}

export function err(code: ActionErrorCode, message: string): ActionResult<never> {
  return { success: false, code, message }
}

/**
 * Map an unknown thrown value to an ActionResult error. Defaults to SERVER
 * unless a code is supplied. Use in catch blocks.
 */
export function fromError(error: unknown, fallback: ActionErrorCode = 'SERVER'): ActionResult<never> {
  const message = error instanceof Error ? error.message : String(error)
  return { success: false, code: fallback, message }
}
