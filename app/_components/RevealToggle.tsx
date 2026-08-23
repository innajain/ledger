'use client'

import { usePrivacy } from './PrivacyProvider'

/**
 * Navbar switch that reveals every masked amount for the current session. Purely
 * ephemeral — it is not persisted to the user's preferences, so a reload goes back to
 * the threshold-derived defaults.
 */
export function RevealToggle({ className }: { className?: string }) {
  const { masking_enabled, reveal_all, set_reveal_all } = usePrivacy()

  // Nothing is masked, so there is nothing to reveal.
  if (!masking_enabled) return null

  const label = reveal_all ? 'Hide amounts' : 'Reveal all amounts'

  return (
    <button
      type="button"
      onClick={() => set_reveal_all(!reveal_all)}
      aria-label={label}
      aria-pressed={reveal_all}
      title={label}
      className={`p-2 rounded-lg transition-all hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        reveal_all
          ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
      } ${className ?? ''}`}
    >
      {reveal_all ? (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.774 3.162 10.066 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243"
          />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.964 7.183.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      )}
    </button>
  )
}

export default RevealToggle
