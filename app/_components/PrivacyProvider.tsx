'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

type PrivacySettings = {
  masking_enabled: boolean
  mask_threshold: number
  graphs_visible: boolean
}

type PrivacyContextValue = PrivacySettings & {
  set_masking_enabled: (enabled: boolean) => void
  set_mask_threshold: (threshold: number) => void
  set_graphs_visible: (visible: boolean) => void
}

const DEFAULTS: PrivacySettings = {
  masking_enabled: true,
  mask_threshold: 50_000,
  graphs_visible: false,
}

const STORAGE_KEY = 'ledger-privacy'

const PrivacyContext = createContext<PrivacyContextValue | null>(null)

export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext)
  if (!ctx) throw new Error('usePrivacy must be used within PrivacyProvider')
  return ctx
}

export function PrivacyProvider({ children }: { children: ReactNode }) {
  // Start with defaults so SSR and initial client render agree. After mount we
  // hydrate from localStorage; the only visible flash is amounts becoming MORE
  // revealed (when the user has lowered privacy), never less.
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULTS)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<PrivacySettings>
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSettings({
        masking_enabled: typeof parsed.masking_enabled === 'boolean' ? parsed.masking_enabled : DEFAULTS.masking_enabled,
        mask_threshold:
          typeof parsed.mask_threshold === 'number' && Number.isFinite(parsed.mask_threshold) && parsed.mask_threshold >= 0
            ? parsed.mask_threshold
            : DEFAULTS.mask_threshold,
        graphs_visible: typeof parsed.graphs_visible === 'boolean' ? parsed.graphs_visible : DEFAULTS.graphs_visible,
      })
    } catch {
      // Malformed JSON or storage disabled — fall back to defaults.
    }
  }, [])

  const persist = useCallback((next: PrivacySettings) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage may be disabled (private mode, quota). Update in-memory only.
    }
  }, [])

  const set_masking_enabled = useCallback(
    (enabled: boolean) => {
      setSettings(prev => {
        const next = { ...prev, masking_enabled: enabled }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const set_mask_threshold = useCallback(
    (threshold: number) => {
      const clean = Number.isFinite(threshold) && threshold >= 0 ? threshold : DEFAULTS.mask_threshold
      setSettings(prev => {
        const next = { ...prev, mask_threshold: clean }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const set_graphs_visible = useCallback(
    (visible: boolean) => {
      setSettings(prev => {
        const next = { ...prev, graphs_visible: visible }
        persist(next)
        return next
      })
    },
    [persist],
  )

  return (
    <PrivacyContext.Provider
      value={{
        masking_enabled: settings.masking_enabled,
        mask_threshold: settings.mask_threshold,
        graphs_visible: settings.graphs_visible,
        set_masking_enabled,
        set_mask_threshold,
        set_graphs_visible,
      }}
    >
      {children}
    </PrivacyContext.Provider>
  )
}
