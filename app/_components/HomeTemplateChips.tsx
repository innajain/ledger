'use client'

import { useRouter } from 'next/navigation'

export type HomeTemplate = {
  id: string
  description: string | null
  line_items: {
    accounting_head_id: string
    asset_id: string
    description: string | null
    quantity: number | null
    txn_value: number | null
  }[]
}

/**
 * The fast path for the app's primary daily write. Same mechanism as the transactions list:
 * stash the template under `ledger_quick_template` and let /transactions/create pick it up.
 */
export function HomeTemplateChips({ templates }: { templates: HomeTemplate[] }) {
  const router = useRouter()
  if (templates.length === 0) return null

  return (
    <div className="mt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Quick add</p>
      <div className="flex overflow-x-auto gap-2 pb-1 -mx-6 px-6 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] scrollbar-none">
        {templates.map(t => (
          <button
            key={t.id}
            type="button"
            className="shrink-0 py-1.5 px-3 border border-slate-200 dark:border-slate-600 rounded-full bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm font-medium text-slate-800 dark:text-slate-200 truncate max-w-37.5 sm:max-w-62.5"
            onClick={() => {
              try {
                sessionStorage.setItem('ledger_quick_template', JSON.stringify(t))
              } catch {}
              router.push(`/transactions/create?templateId=${t.id}`)
            }}
          >
            {t.description || 'Unnamed Template'}
          </button>
        ))}
      </div>
    </div>
  )
}
