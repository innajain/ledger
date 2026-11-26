'use client'

import { useState, useId } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/app/_components/PageHeader'
import { Card } from '@/app/_components/Card'
import { Button } from '@/app/_components/Button'
import { EmptyState } from '@/app/_components/EmptyState'
import { TagEmptyIcon } from '@/app/_components/EmptyStateIcons'
import { ErrorAlert } from '@/app/_components/FormComponents'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
import { useToast } from '@/app/_components/Toast'
import { create_transaction_tag } from '@/app/_actions/tags'
import { format_day } from '@/app/_utils/format_date'

export type TagRow = {
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

export default function ClientPage({ tags }: { tags: TagRow[] }) {
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
      const res = await create_transaction_tag({ name, description: description || null })
      if (!res.success) {
        setError(res.message)
        return
      }
      setName('')
      setDescription('')
      setCreating(false)
      showToast('Tag created', 'success')
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
        title="Tags"
        description="Label similar transactions — “Eating out”, “Goa trip” — and see what the whole bundle comes to."
        actions={
          tags.length > 0 && !creating ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              New tag
            </Button>
          ) : undefined
        }
      />

      {creating && (
        <Card className="p-4 sm:p-6">
          <form onSubmit={onCreate} className="space-y-4">
            <div>
              <label htmlFor={`${uid}-name`} className="block text-sm font-medium text-ink-2 mb-2">
                Name
              </label>
              <input
                id={`${uid}-name`}
                type="text"
                value={name}
                autoFocus
                onChange={e => setName(e.target.value)}
                placeholder="Eating out"
                className="w-full px-3 py-2 bg-raised border border-rule-strong text-ink rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-description`} className="block text-sm font-medium text-ink-2 mb-2">
                Description <span className="font-normal text-ink-3">(optional)</span>
              </label>
              <input
                id={`${uid}-description`}
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Lunches and dinners out, excluding groceries"
                className="w-full px-3 py-2 bg-raised border border-rule-strong text-ink rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                {busy ? 'Creating…' : 'Create tag'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {tags.length === 0 ? (
        !creating && (
          <div className="space-y-4">
            <EmptyState
              icon={<TagEmptyIcon />}
              title="No tags yet"
              description="A tag is a label you hang on whole transactions — every dinner and lunch, or everything from one trip. It changes no balance; it just lets you pull the set back up and see the total."
            />
            <div className="flex justify-center">
              <Button variant="primary" onClick={() => setCreating(true)}>
                Create your first tag
              </Button>
            </div>
          </div>
        )
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tags.map(g => (
            <li key={g.id}>
              <Link href={`/tags/${g.id}`} className="sheet block h-full p-5 hover:border-blue-300 dark:hover:border-blue-600">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-xl font-medium text-ink truncate">{g.name}</h2>
                    {g.description && <p className="text-sm text-ink-3 mt-0.5 line-clamp-2">{g.description}</p>}
                  </div>
                  {/* Non-interactive: the whole card is the link, so the amount can't
                      offer its own click-to-reveal here. */}
                  <span className={`shrink-0 text-lg font-semibold tabular-nums ${g.net > 0 ? 'text-pos' : 'text-ink'}`}>
                    <MaskedAmount value={g.net} interactive={false} keep_sign />
                  </span>
                </div>
                <p className="mt-3 text-sm text-ink-3">
                  {g.count === 0 && g.future_count === 0
                    ? 'No transactions yet'
                    : `${g.count} transaction${g.count === 1 ? '' : 's'}${g.future_count > 0 ? ` · ${g.future_count} scheduled` : ''}`}
                  {g.last_datetime && ` · last ${format_day(g.last_datetime)}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
