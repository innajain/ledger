import { useState, useEffect } from 'react'
import { load_session, save_token, clear_token } from '../../auth_store'
import { authenticate, sign_token, sign_up_core } from '@/app/_core/auth_core'

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
    if (!u) return { success: false, error: 'Invalid credentials' }
    const token = await sign_token({ uid: u.id, username: u.username })
    await save_token(token)
    setSession({ uid: u.id, username: u.username })
    return { success: true }
  }

  const signup = async (user: string, pass: string) => {
    const res = await sign_up_core({ username: user, password: pass })
    if (!res.success) return { success: false, error: res.message }
    const u = res.data!
    const token = await sign_token({ uid: u.id, username: u.username })
    await save_token(token)
    setSession({ uid: u.id, username: u.username })
    return { success: true }
  }

  const logout = async () => {
    await clear_token()
    setSession(null)
  }

  return { session, loading, login, signup, logout }
}
