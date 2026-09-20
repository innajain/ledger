'use client'

import { useState, useId } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/app/_components/PageHeader'
import { Card } from '@/app/_components/Card'
import { Button } from '@/app/_components/Button'
import { EmptyState } from '@/app/_components/EmptyState'
import { GroupEmptyIcon } from '@/app/_components/EmptyStateIcons'
import { ErrorAlert } from '@/app/_components/FormComponents'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
import { useToast } from '@/app/_components/Toast'
import { create_transaction_group } from '@/app/_actions/groups'

export type GroupRow = {
  id: string
  name: string
  description: string | null
  created_at: string
  count: number
  future_count: number
  inflow: number
  outflow: number
  net: number
  last_datetime: string | null
}

const IST = 'Asia/Kolkata'
const day_fmt = new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric' })

export default function ClientPage({ groups }: { groups: GroupRow[] }) {
  const router = useRouter()
  const uid = useId()
  const { showToast } = useToast()
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await create_transaction_group({ name, description: description || null })
      if (!res.success) {
        setError(res.message)
        return
      }
      setName('')
      setDescription('')
      setCreating(false)
      showToast('Group created', 'success')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Groups"
        description="Label similar transactions — “Eating out”, “Goa trip” — and see what the whole bundle comes to."
        actions={
          groups.length > 0 && !creating ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              New group
            </Button>
          ) : undefined
        }
      />

      {creating && (
        <Card className="p-6">
          <form onSubmit={onCreate} className="space-y-4">
            <div>
              <label htmlFor={`${uid}-name`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Name
              </label>
              <input
                id={`${uid}-name`}
                type="text"
                value={name}
                autoFocus
                onChange={e => setName(e.target.value)}
                placeholder="Eating out"
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-description`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Description <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
              </label>
              <input
                id={`${uid}-description`}
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Lunches and dinners out, excluding groceries"
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setCreating(false)
                  setError(null)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={busy || name.trim() === ''}>
                {busy ? 'Creating…' : 'Create group'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {groups.length === 0 ? (
        !creating && (
          <div className="space-y-4">
            <EmptyState
              icon={<GroupEmptyIcon />}
              title="No groups yet"
              description="A group is a label you hang on whole transactions — every dinner and lunch, or everything from one trip. It changes no balance; it just lets you pull the set back up and see the total."
            />
            <div className="flex justify-center">
              <Button variant="primary" onClick={() => setCreating(true)}>
                Create your first group
              </Button>
            </div>
          </div>
        )
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map(g => (
            <li key={g.id}>
              <Link
                href={`/groups/${g.id}`}
                className="block h-full bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-5 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">{g.name}</h2>
                    {g.description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{g.description}</p>}
                  </div>
                  {/* Non-interactive: the whole card is the link, so the amount can't
                      offer its own click-to-reveal here. */}
                  <span
                    className={`shrink-0 text-lg font-semibold tabular-nums ${
                      g.net > 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    <MaskedAmount value={g.net} interactive={false} keep_sign />
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  {g.count === 0 && g.future_count === 0
                    ? 'No transactions yet'
                    : `${g.count} transaction${g.count === 1 ? '' : 's'}${g.future_count > 0 ? ` · ${g.future_count} scheduled` : ''}`}
                  {g.last_datetime && ` · last ${day_fmt.format(new Date(g.last_datetime))}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
