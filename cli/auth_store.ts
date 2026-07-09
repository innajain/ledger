import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { verify_token } from '@/app/_core/auth_core'

const dir = join(homedir(), '.ledger')
const token_file = join(dir, 'token.json')

export type Session = { uid: string; username: string }

export async function save_token(token: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  await fs.writeFile(token_file, JSON.stringify({ token }), { mode: 0o600 })
}

export async function clear_token(): Promise<void> {
  await fs.rm(token_file, { force: true })
}

export async function load_session(): Promise<Session | null> {
  let raw: string
  try {
    raw = await fs.readFile(token_file, 'utf8')
  } catch {
    return null
  }
  try {
    const { token } = JSON.parse(raw) as { token?: string }
    if (!token) return null
    const { uid, username } = await verify_token(token)
    return { uid, username: username ?? '(unknown)' }
  } catch {
    return null
  }
}

export async function require_session(): Promise<Session> {
  const s = await load_session()
  if (!s) {
    throw new Error('Not logged in. Run `login` first.')
  }
  return s
}
