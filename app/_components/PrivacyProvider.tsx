'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { update_user_preferences } from '@/app/_actions/preferences'
import { UnmaskPrompt } from './UnmaskPrompt'

/** How long one password entry keeps amounts unlocked before everything is masked again. */
const UNLOCK_MINUTES = 5
const UNLOCK_MS = UNLOCK_MINUTES * 60 * 1000

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
  /**
   * Resolves true once the user may see masked amounts: at once inside an unlock window,
   * otherwise after they re-enter their password. Every path that reveals something calls
   * it first. When the window ends, everything is masked again.
   */
  request_unmask: () => Promise<boolean>
  /** Turning masking off needs the password; turning it on never does. Resolves whether it changed. */
  set_masking_enabled: (enabled: boolean) => Promise<boolean>
  /** Raising the threshold reveals amounts, so it needs the password too. Resolves whether it changed. */
  set_mask_threshold: (threshold: number) => Promise<boolean>
  set_graphs_visible: (visible: boolean) => void
  set_reveal_all: (revealed: boolean) => Promise<boolean>
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null)

export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext)
  if (!ctx) throw new Error('usePrivacy must be used within PrivacyProvider')
  return ctx
}

/**
 * The same hide-or-show decision `MaskedAmount` makes, for places that render amounts
 * outside that component — chart axes, tooltips, canvas labels. Anything the mask hides
 * in text must not resurface in a graph.
 */
export function useAmountMask(): { hide: (value: number) => boolean } {
  const { masking_enabled, mask_threshold, reveal_all } = usePrivacy()
  return {
    hide: (value: number) => masking_enabled && !reveal_all && Math.abs(value) > mask_threshold,
  }
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

  // The unlock window lives in memory only: a reload starts masked and locked again.
  const unlocked_until = useRef(0)
  const relock_timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const waiting = useRef<((ok: boolean) => void)[]>([])
  const [prompt_open, set_prompt_open] = useState(false)

  // Back under the mask: the reveal-all switch goes off, and the epoch bump drops every
  // per-amount and per-chart reveal (they are tagged with the epoch they were made in).
  const relock = useCallback(() => {
    clearTimeout(relock_timer.current)
    unlocked_until.current = 0
    setReveal(prev => ({ all: false, epoch: prev.epoch + 1 }))
  }, [])

  const request_unmask = useCallback((): Promise<boolean> => {
    if (Date.now() < unlocked_until.current) return Promise.resolve(true)
    return new Promise(resolve => {
      waiting.current.push(resolve)
      set_prompt_open(true)
    })
  }, [])

  const on_prompt_done = useCallback(
    (ok: boolean) => {
      set_prompt_open(false)
      if (ok) {
        unlocked_until.current = Date.now() + UNLOCK_MS
        clearTimeout(relock_timer.current)
        relock_timer.current = setTimeout(relock, UNLOCK_MS)
      }
      const resolvers = waiting.current
      waiting.current = []
      for (const resolve of resolvers) resolve(ok)
    },
    [relock],
  )

  useEffect(() => {
    // A phone that sleeps can hold the timer past the deadline; check again on wake.
    const on_visible = () => {
      if (document.visibilityState === 'visible' && unlocked_until.current !== 0 && Date.now() >= unlocked_until.current) relock()
    }
    document.addEventListener('visibilitychange', on_visible)
    return () => {
      document.removeEventListener('visibilitychange', on_visible)
      clearTimeout(relock_timer.current)
    }
  }, [relock])

  const update = useCallback(
    (patch: Partial<PrivacySettings>) => {
      setSettings(prev => ({ ...prev, ...patch }))
      if (persist) {
        void update_user_preferences(patch).catch(() => {})
      }
    },
    [persist],
  )

  const flip_reveal_all = useCallback((revealed: boolean) => {
    setReveal(prev => (prev.all === revealed ? prev : { all: revealed, epoch: prev.epoch + 1 }))
  }, [])

  const set_reveal_all = useCallback(
    async (revealed: boolean) => {
      if (revealed && !(await request_unmask())) return false
      flip_reveal_all(revealed)
      return true
    },
    [request_unmask, flip_reveal_all],
  )

  const set_masking_enabled = useCallback(
    async (enabled: boolean) => {
      if (!enabled && settings.masking_enabled && !(await request_unmask())) return false
      update({ masking_enabled: enabled })
      // Nothing left to reveal once masking is off — don't leave the switch armed for
      // the next time masking is turned back on.
      if (!enabled) flip_reveal_all(false)
      return true
    },
    [update, flip_reveal_all, request_unmask, settings.masking_enabled],
  )
  const set_mask_threshold = useCallback(
    async (threshold: number) => {
      const clean = Number.isFinite(threshold) && threshold >= 0 ? Math.floor(threshold) : 50_000
      if (clean > settings.mask_threshold && settings.masking_enabled && !(await request_unmask())) return false
      update({ mask_threshold: clean })
      return true
    },
    [update, request_unmask, settings.mask_threshold, settings.masking_enabled],
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
        request_unmask,
        set_masking_enabled,
        set_mask_threshold,
        set_graphs_visible,
        set_reveal_all,
      }}
    >
      {children}
      <UnmaskPrompt open={prompt_open} minutes={UNLOCK_MINUTES} onDone={on_prompt_done} />
    </PrivacyContext.Provider>
  )
}
