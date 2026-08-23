'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'

export type ComboOption = {
  id: string
  name: string
  /** Small muted text after the name (e.g. an asset type). */
  hint?: string
}

type Props = {
  options: ComboOption[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  placeholder?: string
  /** Accessible name for the input when there is no visible associated label. */
  'aria-label'?: string
  id?: string
  className?: string
}

/**
 * A searchable single-select for lists that outgrow a native <select> (accounts, assets).
 * Keyboard: type to filter, ArrowUp/Down to move, Enter to pick, Escape to close and
 * restore. The text box always reflects the current selection when closed.
 */
export function Combobox({ options, value, onChange, disabled = false, placeholder, 'aria-label': ariaLabel, id, className }: Props) {
  const listId = useId()
  const selected = options.find(o => o.id === value) ?? null

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.name.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[active] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function openList() {
    // Re-running on a click inside an already-open list would wipe the typed filter.
    if (disabled || open) return
    setQuery('')
    setActive(
      Math.max(
        0,
        options.findIndex(o => o.id === value),
      ),
    )
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setQuery('')
  }

  function pick(id: string) {
    onChange(id)
    close()
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
      e.preventDefault()
      openList()
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[active]
      if (opt) pick(opt.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab') {
      // Tab commits what the user was pointing at — the native select this replaced
      // committed type-ahead instantly, and silently reverting a money-posting field
      // to its previous value is the one thing this control must never do. Escape
      // remains the explicit "never mind".
      const opt = filtered[active]
      if (query.trim() !== '' && opt) onChange(opt.id)
      close()
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${listId}-${filtered[active].id}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        placeholder={placeholder ?? 'Search…'}
        value={open ? query : (selected?.name ?? '')}
        onChange={e => {
          if (!open) setOpen(true)
          setQuery(e.target.value)
          setActive(0)
        }}
        onFocus={openList}
        onClick={openList}
        onKeyDown={onKeyDown}
        className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-70 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800"
      />
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg py-1"
        >
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No matches</li>}
          {filtered.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${o.id}`}
              role="option"
              aria-selected={o.id === value}
              onMouseDown={e => {
                // before the input blurs
                e.preventDefault()
                pick(o.id)
              }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-2 text-sm cursor-pointer flex items-baseline justify-between gap-2 ${
                i === active ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100' : 'text-slate-900 dark:text-slate-100'
              } ${o.id === value ? 'font-semibold' : ''}`}
            >
              <span className="truncate">{o.name}</span>
              {o.hint && <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
