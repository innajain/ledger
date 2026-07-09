'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { update_user_preferences } from '@/app/_actions/preferences'

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

const PrivacyContext = createContext<PrivacyContextValue | null>(null)

export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext)
  if (!ctx) throw new Error('usePrivacy must be used within PrivacyProvider')
  return ctx
}

export function PrivacyProvider({
  initial,
  persist,
  children,
}: {
  initial: PrivacySettings

  persist: boolean
  children: ReactNode
}) {
  const [settings, setSettings] = useState<PrivacySettings>(initial)

  const update = useCallback(
    (patch: Partial<PrivacySettings>) => {
      setSettings(prev => ({ ...prev, ...patch }))
      if (persist) {
        void update_user_preferences(patch).catch(() => {})
      }
    },
    [persist],
  )

  const set_masking_enabled = useCallback((enabled: boolean) => update({ masking_enabled: enabled }), [update])
  const set_mask_threshold = useCallback(
    (threshold: number) => {
      const clean = Number.isFinite(threshold) && threshold >= 0 ? Math.floor(threshold) : 50_000
      update({ mask_threshold: clean })
    },
    [update],
  )
  const set_graphs_visible = useCallback((visible: boolean) => update({ graphs_visible: visible }), [update])

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
