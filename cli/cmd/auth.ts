import { authenticate, sign_token } from '@/app/_core/auth_core'
import { save_token, clear_token, load_session } from '../auth_store'
import { ask, ask_hidden } from '../prompt'

export async function cmd_login() {
  const username = (await ask('Username: ')).trim()
  const password = await ask_hidden('Password: ')
  const user = await authenticate(username, password)
  if (!user) {
    console.error('✗ invalid credentials')
    process.exitCode = 1
    return
  }
  const token = await sign_token({ uid: user.id, username: user.username })
  await save_token(token)
  console.log(`✓ Logged in as ${user.username}`)
}

export async function cmd_logout() {
  await clear_token()
  console.log('✓ Logged out')
}

export async function cmd_whoami() {
  const s = await load_session()
  if (!s) {
    console.log('Not logged in.')
    return
  }
  console.log(`${s.username}  (${s.uid})`)
}
