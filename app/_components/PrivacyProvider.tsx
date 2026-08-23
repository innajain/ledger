'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { update_user_preferences } from '@/app/_actions/preferences'

type PrivacySettings = {
  masking_enabled: boolean
  mask_threshold: number
  graphs_visible: boolean
}

type PrivacyContextValue = PrivacySettings & {
  /** Session-only "show everything" switch. Never persisted — it resets on reload. */
  reveal_all: boolean
  /**
   * Bumped every time `reveal_all` actually flips. `MaskedAmount` tags its per-instance
   * override with the epoch it was made in, so a flip drops stale overrides purely by
   * derivation during render (no state-syncing effect).
   */
  reveal_epoch: number
  set_masking_enabled: (enabled: boolean) => void
  set_mask_threshold: (threshold: number) => void
  set_graphs_visible: (visible: boolean) => void
  set_reveal_all: (revealed: boolean) => void
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
  // Deliberately outside `settings`: this must never reach `update_user_preferences`.
  const [reveal, setReveal] = useState({ all: false, epoch: 0 })

  const update = useCallback(
    (patch: Partial<PrivacySettings>) => {
      setSettings(prev => ({ ...prev, ...patch }))
      if (persist) {
        void update_user_preferences(patch).catch(() => {})
      }
    },
    [persist],
  )

  const set_reveal_all = useCallback((revealed: boolean) => {
    setReveal(prev => (prev.all === revealed ? prev : { all: revealed, epoch: prev.epoch + 1 }))
  }, [])

  const set_masking_enabled = useCallback(
    (enabled: boolean) => {
      update({ masking_enabled: enabled })
      // Nothing left to reveal once masking is off — don't leave the switch armed for
      // the next time masking is turned back on.
      if (!enabled) set_reveal_all(false)
    },
    [update, set_reveal_all],
  )
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
        reveal_all: reveal.all,
        reveal_epoch: reveal.epoch,
        set_masking_enabled,
        set_mask_threshold,
        set_graphs_visible,
        set_reveal_all,
      }}
    >
      {children}
    </PrivacyContext.Provider>
  )
}
