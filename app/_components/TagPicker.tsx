'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CloseIcon, Spinner } from './icons'
import { create_transaction_tag } from '@/app/_actions/tags'

export type TagOption = { id: string; name: string }

type Props = {
  /** Every tag the user has. Grows in place when one is created from here. */
  options: TagOption[]
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}

/**
 * Multi-select for a transaction's tags: selected tags are chips, the box
 * below filters the rest, and typing a name nothing matches offers to create it
 * on the spot — the whole point of tagging is that you invent the bucket while
 * posting the transaction that needs it, not on a separate settings trip.
 *
 * Creating writes immediately (a tag is a standalone row with nothing to roll
 * back), while membership is only ever saved with the form around it.
 */
export function TagPicker({ options, value, onChange, disabled = false }: Props) {
  const uid = useId()
  const listId = `${uid}-list`
  const [available, setAvailable] = useState<TagOption[]>(options)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // The server list can arrive after a refresh (a tag created on another page).
  /* eslint-disable-next-line react-hooks/set-state-in-effect */
  useEffect(() => setAvailable(options), [options])

  const by_id = useMemo(() => new Map(available.map(g => [g.id, g])), [available])
  const selected = value.map(id => by_id.get(id)).filter((g): g is TagOption => !!g)

  const q = query.trim().toLowerCase()
  const suggestions = useMemo(
    () => available.filter(g => !value.includes(g.id)).filter(g => !q || g.name.toLowerCase().includes(q)),
    [available, value, q],
  )
  const exact = available.some(g => g.name.toLowerCase() === q)
  const canCreate = q.length > 0 && !exact

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  /* eslint-disable-next-line react-hooks/set-state-in-effect */
  useEffect(() => setActive(0), [query])

  function pick(id: string) {
    if (!value.includes(id)) onChange([...value, id])
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function remove(id: string) {
    onChange(value.filter(v => v !== id))
  }

  async function createAndPick() {
    const name = query.trim()
    if (!name || creating) return
    setCreating(true)
    setError(null)
    try {
      const res = await create_transaction_tag({ name })
      if (!res.success) {
        setError(res.message)
        return
      }
      const created = res.data!
      setAvailable(prev => (prev.some(g => g.id === created.id) ? prev : [...prev, created].sort((a, b) => a.name.localeCompare(b.name))))
      pick(created.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  // Options plus, when the typed name is new, one trailing "create" row.
  const rowCount = suggestions.length + (canCreate ? 1 : 0)

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && query === '' && value.length > 0) {
      remove(value[value.length - 1])
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) setOpen(true)
      if (rowCount === 0) return
      setActive(a => (e.key === 'ArrowDown' ? (a + 1) % rowCount : (a - 1 + rowCount) % rowCount))
      return
    }
    if (e.key === 'Enter') {
      // Never let the tag box submit the transaction form around it.
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (active < suggestions.length) pick(suggestions[active].id)
      else if (canCreate) void createAndPick()
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2 mb-2">
          {selected.map(g => (
            <li key={g.id}>
              <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 text-sm text-blue-800 dark:text-blue-200">
                {g.name}
                <button
                  type="button"
                  onClick={() => remove(g.id)}
                  disabled={disabled}
                  aria-label={`Remove from ${g.name}`}
                  className="text-blue-500 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-100 disabled:opacity-50"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        disabled={disabled}
        placeholder={selected.length > 0 ? 'Add another tag…' : 'Search or create a tag…'}
        onChange={e => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        // onFocus alone leaves the box dead after a pick: picking closes the list but
        // keeps focus here, so the next click fires no focus event and nothing opens.
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
      />

      {open && (rowCount > 0 || available.length === 0) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg py-1"
        >
          {suggestions.map((g, i) => (
            <li key={g.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(g.id)}
                className={`w-full text-left px-3 py-2 text-sm ${
                  i === active ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100' : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {g.name}
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={active === suggestions.length}
                onMouseEnter={() => setActive(suggestions.length)}
                onClick={() => void createAndPick()}
                disabled={creating}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                  active === suggestions.length ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                } text-blue-700 dark:text-blue-300 disabled:opacity-50`}
              >
                {creating ? <Spinner className="w-4 h-4" /> : <span aria-hidden>+</span>}
                Create “{query.trim()}”
              </button>
            </li>
          )}
          {available.length === 0 && !canCreate && (
            <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Type a name to create your first tag</li>
          )}
        </ul>
      )}

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
