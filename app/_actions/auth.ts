'use server'

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import type { user } from '@/generated/prisma/client'
import { z } from 'zod'

const token_name = 'ledger_token'
const JWT_EXPIRY_DAYS = 7
const JWT_EXPIRY_SECONDS = JWT_EXPIRY_DAYS * 24 * 60 * 60

type ActionResponse = { success: boolean; message: string }

const AuthSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required')
})

const ChangePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string().min(1, 'New password is required')
})

const ChangeUsernameSchema = z.object({
  new_username: z.string().min(1, 'New username is required'),
  password: z.string().min(1, 'Password is required')
})

function get_secret(): string {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET is not set')
  return s
}

async function sign_token(payload: { uid: string }): Promise<string> {
  return jwt.sign(payload, get_secret(), { expiresIn: `${JWT_EXPIRY_DAYS}d` })
}

function verify_token(token: string): { uid: string } {
  return jwt.verify(token, get_secret()) as { uid: string }
}

export async function sign_up(payload: z.infer<typeof AuthSchema>): Promise<ActionResponse> {
  try {
    const { username, password } = AuthSchema.parse(payload)

    const existing = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    })
    if (existing) return { success: false, message: 'user already exists' }

    const password_hash = await bcrypt.hash(password, 10)
    const created = await prisma.user.create({
      data: { username, password_hash },
      select: { id: true, username: true },
    })

    const token = await sign_token({ uid: created.id })
    const cookieStore = await cookies()
    cookieStore.set({
      name: token_name,
      value: token,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: JWT_EXPIRY_SECONDS,
    })

    return { success: true, message: 'Account created successfully' }
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, message: error.issues[0].message }
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function log_in(payload: z.infer<typeof AuthSchema>): Promise<ActionResponse> {
  try {
    const { username, password } = AuthSchema.parse(payload)

    const userRec = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, password_hash: true },
    })
    if (!userRec) return { success: false, message: 'invalid credentials' }

    const ok = await bcrypt.compare(password, userRec.password_hash)
    if (!ok) return { success: false, message: 'invalid credentials' }

    const token = await sign_token({ uid: userRec.id })
    const cookieStore = await cookies()
    cookieStore.set({
      name: token_name,
      value: token,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: JWT_EXPIRY_SECONDS,
    })

    return { success: true, message: 'Logged in successfully' }
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, message: error.issues[0].message }
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function log_out(): Promise<ActionResponse> {
  try {
    const cookieStore = await cookies()
    cookieStore.set({
      name: token_name,
      value: '',
      path: '/',
      expires: new Date(0),
    })
    return { success: true, message: 'Logged out successfully' }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Cache the current user for the duration of the request
export const get_current_user = cache(async (): Promise<user | null> => {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(token_name)?.value
  if (!cookie) return null
  try {
    const payload = verify_token(cookie)
    const userRec = await prisma.user.findUnique({
      where: { id: payload.uid },
      select: { id: true, username: true },
    })
    return userRec as user | null
  } catch {
    return null
  }
})

export async function change_password(payload: z.infer<typeof ChangePasswordSchema>): Promise<ActionResponse> {
  try {
    const { current_password, new_password } = ChangePasswordSchema.parse(payload)

    // Get the current user
    const user = await get_current_user()
    if (!user) return { success: false, message: 'not authenticated' }

    // Fetch the user with password hash
    const userRec = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, password_hash: true },
    })
    if (!userRec) return { success: false, message: 'user not found' }

    // Verify current password
    const isValid = await bcrypt.compare(current_password, userRec.password_hash)
    if (!isValid) return { success: false, message: 'current password is incorrect' }

    // Hash and update new password
    const new_password_hash = await bcrypt.hash(new_password, 10)
    await prisma.user.update({
      where: { id: user.id },
      data: { password_hash: new_password_hash },
    })

    return { success: true, message: 'Password changed successfully' }
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, message: error.issues[0].message }
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function change_username(payload: z.infer<typeof ChangeUsernameSchema>): Promise<ActionResponse> {
  try {
    const { new_username, password } = ChangeUsernameSchema.parse(payload)

    // Get the current user
    const user = await get_current_user()
    if (!user) return { success: false, message: 'not authenticated' }

    // Fetch the user with password hash
    const userRec = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, username: true, password_hash: true },
    })
    if (!userRec) return { success: false, message: 'user not found' }

    // Verify password
    const isValid = await bcrypt.compare(password, userRec.password_hash)
    if (!isValid) return { success: false, message: 'password is incorrect' }

    // Check if new username already exists
    const existing = await prisma.user.findUnique({
      where: { username: new_username },
      select: { id: true },
    })
    if (existing && existing.id !== user.id) {
      return { success: false, message: 'username already taken' }
    }

    // Don't allow changing to the same username
    if (userRec.username === new_username) {
      return { success: false, message: 'new username must be different from current username' }
    }

    // Update username
    await prisma.user.update({
      where: { id: user.id },
      data: { username: new_username },
    })

    return { success: true, message: 'Username changed successfully' }
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, message: error.issues[0].message }
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
  }
}
