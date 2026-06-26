import { useState, useEffect } from 'react'
import { load_session, save_token, clear_token } from '../../auth_store'
import { authenticate, sign_token } from '@/app/_core/auth_core'

export type Session = { uid: string; username: string }

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load_session().then(s => {
      setSession(s)
      setLoading(false)
    })
  }, [])

  const login = async (user: string, pass: string) => {
    const u = await authenticate(user, pass)
    if (!u) return false
    const token = await sign_token({ uid: u.id, username: u.username })
    await save_token(token)
    setSession({ uid: u.id, username: u.username })
    return true
  }

  const logout = async () => {
    await clear_token()
    setSession(null)
  }

  return { session, loading, login, logout }
}
