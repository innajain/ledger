'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { update_user_preferences, type ThemeChoice } from '@/app/_actions/preferences'

type ThemeContextValue = {
  theme: ThemeChoice
  resolved_theme: 'light' | 'dark'
  set_theme: (theme: ThemeChoice) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

function resolve(theme: ThemeChoice): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function apply_class(resolved: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

export function ThemeProvider({
  initial,
  persist,
  children,
}: {
  initial: ThemeChoice

  persist: boolean
  children: ReactNode
}) {
  const [theme, setThemeState] = useState<ThemeChoice>(initial)
  const [resolved, setResolvedState] = useState<'light' | 'dark'>(() => (theme === 'system' ? 'light' : theme))

  useEffect(() => {
    const r = resolve(theme)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolvedState(r)
    apply_class(r)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const r: 'light' | 'dark' = mq.matches ? 'dark' : 'light'
      setResolvedState(r)
      apply_class(r)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const set_theme = useCallback(
    (next: ThemeChoice) => {
      setThemeState(next)
      if (!persist) return

      void update_user_preferences({ theme: next }).catch(() => {})
    },
    [persist],
  )

  return <ThemeContext.Provider value={{ theme, resolved_theme: resolved, set_theme }}>{children}</ThemeContext.Provider>
}
