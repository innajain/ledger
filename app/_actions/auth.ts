'use server'

import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { isProd } from '@/lib/env'
import type { user } from '@/generated/prisma/client'
import { z } from 'zod'
import { ActionError, ActionResult, ok, err } from './_result'
import { rate_limit } from '@/lib/rate_limit'
import { redis } from '@/lib/redis'
import { audit, logger } from '@/lib/logger'
import { reportUnexpectedError } from '@/lib/action_error'
import {
  authenticate,
  sign_token,
  verify_token,
  JWT_EXPIRY_SECONDS,
  revoke_key,
  sign_up_core,
  change_password_core,
  change_username_core,
} from '@/app/_core/auth_core'

const token_name = 'ledger_token'

function fromCatch(error: unknown, action: string): ActionResult<never> {
  if (error instanceof z.ZodError) return err('VALIDATION', error.issues[0].message)
  if (error instanceof ActionError) return err(error.code, error.message)
  reportUnexpectedError(error, { action })
  const detail = error instanceof Error ? error.message : 'Unknown error'
  return err('SERVER', isProd() ? 'Something went wrong. Please try again.' : detail)
}

const AuthSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

const is_token_revoked = cache(async (uid: string, iat: number | undefined): Promise<boolean> => {
  if (!iat) return false
  try {
    const cutoff = await redis.get(revoke_key(uid))
    return cutoff !== null && iat < Number(cutoff)
  } catch (error) {
    logger.warn(
      { err: error, event: 'operation.degraded', action: 'auth.session_revocation_check', fail_open: true },
      'session revocation check failed',
    )
    return false
  }
})

async function set_session_cookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set({
    name: token_name,
    value: token,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: isProd(),
    maxAge: JWT_EXPIRY_SECONDS,
  })
}

export async function sign_up(payload: { username: string; password: string }): Promise<ActionResult> {
  try {
    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!(await rate_limit(`signup:ip:${ip}`, 5, 60 * 60))) {
      logger.warn({ event: 'auth.denied', action: 'auth.sign_up', reason: 'rate_limited' }, 'sign-up denied')
      return err('VALIDATION', 'Too many sign-ups from this network. Please try again later.')
    }

    const res = await sign_up_core(payload)
    if (!res.success) return res

    const token = await sign_token({ uid: res.data!.id, username: res.data!.username })
    await set_session_cookie(token)
    return ok(undefined, 'Account created')
  } catch (error) {
    return fromCatch(error, 'auth.sign_up')
  }
}

export async function log_in(payload: z.infer<typeof AuthSchema>): Promise<ActionResult> {
  try {
    const { username, password } = AuthSchema.parse(payload)

    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    // Both counters always increment (no short-circuit), so the checks can run concurrently.
    const [within_ip, within_user] = await Promise.all([
      rate_limit(`login:ip:${ip}`, 10, 60),
      rate_limit(`login:user:${username.toLowerCase()}`, 5, 5 * 60),
    ])
    if (!within_ip || !within_user) {
      logger.warn({ event: 'auth.denied', action: 'auth.login', reason: 'rate_limited' }, 'login denied')
      return err('UNAUTHORIZED', 'Too many attempts. Please wait a minute and try again.')
    }

    const userRec = await authenticate(username, password)
    if (!userRec) {
      logger.warn({ event: 'auth.denied', action: 'auth.login', reason: 'invalid_credentials' }, 'login denied')
      return err('UNAUTHORIZED', 'Wrong username or password')
    }

    const token = await sign_token({ uid: userRec.id, username: userRec.username })
    await set_session_cookie(token)

    audit('auth.login', userRec.id)
    return ok(undefined, 'Logged in')
  } catch (error) {
    return fromCatch(error, 'auth.login')
  }
}

export async function log_out(): Promise<ActionResult> {
  try {
    const user_id = await get_current_user_id()
    const cookieStore = await cookies()
    cookieStore.set({
      name: token_name,
      value: '',
      path: '/',
      expires: new Date(0),
    })
    audit('auth.logout', user_id ?? undefined)
    return ok(undefined, 'Logged out')
  } catch (error) {
    return fromCatch(error, 'auth.logout')
  }
}

export const get_current_user_id = cache(async (): Promise<string | null> => {
  const h = await headers()
  const headerUid = h.get('x-user-id')
  if (headerUid) {
    const iat = Number(h.get('x-token-iat')) || undefined
    if (await is_token_revoked(headerUid, iat)) return null
    return headerUid
  }

  const cookie = (await cookies()).get(token_name)?.value
  if (!cookie) return null
  try {
    const { uid, iat } = await verify_token(cookie)
    if (await is_token_revoked(uid, iat)) return null
    return uid
  } catch {
    return null
  }
})

export const get_current_user = cache(async (): Promise<Pick<user, 'id' | 'username'> | null> => {
  const h = await headers()
  const headerUid = h.get('x-user-id')
  const headerUsername = h.get('x-username')
  if (headerUid && headerUsername) {
    const iat = Number(h.get('x-token-iat')) || undefined
    if (await is_token_revoked(headerUid, iat)) return null
    return { id: headerUid, username: headerUsername }
  }

  const cookie = (await cookies()).get(token_name)?.value
  if (!cookie) return null
  let payload: { uid: string; username?: string; iat?: number }
  try {
    payload = await verify_token(cookie)
  } catch {
    return null
  }
  if (await is_token_revoked(payload.uid, payload.iat)) return null
  if (payload.username) return { id: payload.uid, username: payload.username }

  const userRec = await prisma.user.findUnique({
    where: { id: payload.uid },
    select: { id: true, username: true },
  })
  return userRec
})

// One request-deduped read of the caller's user row, selecting the union of what
// the layout (preferences), forms (line-item defaults) and admin/UPI checks need —
// several of these render in the same request and previously each paid their own query.
const user_row_select = {
  is_admin: true,
  upi_id: true,
  theme: true,
  masking_enabled: true,
  mask_threshold: true,
  graphs_visible: true,
  default_account_id: true,
  default_allocation_id: true,
  default_income_expense_id: true,
  default_asset_id: true,
} as const

export type CurrentUserRow = NonNullable<Awaited<ReturnType<typeof get_current_user_row>>>

export const get_current_user_row = cache(async () => {
  const uid = await get_current_user_id()
  if (!uid) return null
  return prisma.user.findUnique({ where: { id: uid }, select: user_row_select })
})

export const is_current_user_admin = cache(async (): Promise<boolean> => {
  const rec = await get_current_user_row()
  return !!rec?.is_admin
})

export async function require_admin(): Promise<string> {
  const id = await get_current_user_id()
  if (!id) {
    logger.warn({ event: 'auth.denied', action: 'auth.require_admin', reason: 'no_session' }, 'admin access denied')
    throw new ActionError('UNAUTHORIZED', 'Your session has expired — log in again')
  }
  const user = await prisma.user.findUnique({
    where: { id },
    select: { is_admin: true },
  })
  if (!user?.is_admin) {
    logger.warn({ event: 'auth.denied', action: 'auth.require_admin', reason: 'not_admin' }, 'admin access denied')
    throw new ActionError('UNAUTHORIZED', 'Admin access is required')
  }
  return id
}

export async function change_password(payload: { current_password: string; new_password: string }): Promise<ActionResult> {
  try {
    const user = await get_current_user()
    if (!user) return err('UNAUTHORIZED', 'Your session has expired — log in again')

    const res = await change_password_core(user.id, payload)
    if (!res.success) return res

    const token = await sign_token({ uid: user.id, username: user.username })
    await set_session_cookie(token)
    return ok(undefined, 'Password changed')
  } catch (error) {
    return fromCatch(error, 'auth.change_password')
  }
}

export async function change_username(payload: { new_username: string; password: string }): Promise<ActionResult> {
  try {
    const user = await get_current_user()
    if (!user) return err('UNAUTHORIZED', 'Your session has expired — log in again')

    const res = await change_username_core(user.id, payload)
    if (!res.success) return res

    const token = await sign_token({ uid: user.id, username: res.data!.username })
    await set_session_cookie(token)
    return ok(undefined, 'Username changed')
  } catch (error) {
    return fromCatch(error, 'auth.change_username')
  }
}
