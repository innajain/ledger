'use client'

import React, { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { update_hierarchy_order } from '@/app/_actions/resources'
import { aggregate_total, count_empty_subtrees, fold_single_child, is_empty_subtree, is_zero_total } from '@/app/_utils/hierarchy_empty'
import { useToast } from './Toast'
import { MaskedAmount } from './MaskedAmount'

type BaseItem = {
  id: string
  name: string
  parent_id: string | null
  is_active: boolean
}

type Node<T extends BaseItem> = {
  item: T
  children: Node<T>[]
}

type HierarchyTreeProps<T extends BaseItem> = {
  items: T[]
  totals: Map<string, number>
  getItemUrl: (id: string) => string
  renderExtraInfo?: (item: T, node: Node<T>) => React.ReactNode
  expandAll?: boolean

  scope?: 'account' | 'asset'
  reorderEnabled?: boolean
  onReorderToggle?: (enabled: boolean) => void
  accentBorderClass?: string

  /** Prune whole subtrees where the node and every descendant is individually zero. */
  hideZero?: boolean
  /** Reports how many rows `hideZero` is currently pruning, so callers can label the toggle. */
  onHiddenCountChange?: (count: number) => void
}

export function HierarchyTree<T extends BaseItem>({
  items,
  totals,
  getItemUrl,
  renderExtraInfo,
  expandAll,
  scope,
  reorderEnabled = false,
  onReorderToggle,
  accentBorderClass,
  hideZero = false,
  onHiddenCountChange,
}: HierarchyTreeProps<T>) {
  const router = useRouter()
  const { showToast } = useToast()

  const [manualExpanded, setManualExpanded] = useState<Record<string, boolean>>({})

  const [optimisticOrder, setOptimisticOrder] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOptimisticOrder({})
  }, [items])

  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [draggedParentId, setDraggedParentId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const expanded = useMemo(() => {
    if (expandAll) {
      return items.reduce((acc, item) => ({ ...acc, [item.id]: true }), {} as Record<string, boolean>)
    }
    return manualExpanded
  }, [expandAll, items, manualExpanded])

  const toggle = (id: string) => {
    if (!expandAll) {
      setManualExpanded(prev => ({ ...prev, [id]: !prev[id] }))
    }
  }

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, id: string, parentId: string | null) => {
    setDraggedId(id)
    setDraggedParentId(parentId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string, parentId: string | null) => {
      e.preventDefault()
      if (id !== draggedId && parentId === draggedParentId) {
        e.dataTransfer.dropEffect = 'move'
        setDragOverId(id)
      } else {
        e.dataTransfer.dropEffect = 'none'
      }
    },
    [draggedId, draggedParentId],
  )

  const handleDragLeave = useCallback(() => {
    setDragOverId(null)
  }, [])

  const applyOrderToSiblings = useCallback(
    (siblings: T[], parentId: string | null): T[] => {
      const key = parentKey(parentId)
      const order = optimisticOrder[key]
      if (!order || order.length === 0) return siblings
      const byId = new Map(siblings.map(s => [s.id, s]))
      const out: T[] = []
      const used = new Set<string>()
      for (const id of order) {
        const item = byId.get(id)
        if (item) {
          out.push(item)
          used.add(id)
        }
      }
      for (const item of siblings) if (!used.has(item.id)) out.push(item)
      return out
    },
    [optimisticOrder],
  )

  const persistOrder = useCallback(
    async (orderIds: string[], parentId: string | null) => {
      setOptimisticOrder(prev => ({ ...prev, [parentKey(parentId)]: orderIds }))
      if (!scope) return

      setSaving(true)
      try {
        const result = await update_hierarchy_order({ scope, parent_id: parentId, ordered_ids: orderIds })
        if (!result.success) {
          showToast(result.message, 'error')

          setOptimisticOrder(prev => {
            const next = { ...prev }
            delete next[parentKey(parentId)]
            return next
          })
        } else {
          router.refresh()
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), 'error')
        setOptimisticOrder(prev => {
          const next = { ...prev }
          delete next[parentKey(parentId)]
          return next
        })
      } finally {
        setSaving(false)
      }
    },
    [scope, router, showToast],
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>, targetId: string, parentId: string | null) => {
      e.preventDefault()

      if (!draggedId || draggedId === targetId || parentId !== draggedParentId) {
        setDraggedId(null)
        setDraggedParentId(null)
        setDragOverId(null)
        return
      }

      const orderedSiblings = applyOrderToSiblings(
        items.filter(item => item.parent_id === parentId),
        parentId,
      )
      const draggedIndex = orderedSiblings.findIndex(item => item.id === draggedId)
      const targetIndex = orderedSiblings.findIndex(item => item.id === targetId)

      if (draggedIndex === -1 || targetIndex === -1) {
        setDraggedId(null)
        setDraggedParentId(null)
        setDragOverId(null)
        return
      }

      const newOrder = [...orderedSiblings]
      const [draggedItem] = newOrder.splice(draggedIndex, 1)
      newOrder.splice(targetIndex, 0, draggedItem)

      setDraggedId(null)
      setDraggedParentId(null)
      setDragOverId(null)

      await persistOrder(
        newOrder.map(i => i.id),
        parentId,
      )
    },
    [draggedId, draggedParentId, items, applyOrderToSiblings, persistOrder],
  )

  /** Keyboard/tap alternative to drag-and-drop: move one step within the same level. */
  const moveBy = useCallback(
    async (id: string, parentId: string | null, delta: -1 | 1) => {
      const orderedSiblings = applyOrderToSiblings(
        items.filter(item => item.parent_id === parentId),
        parentId,
      )
      const from = orderedSiblings.findIndex(item => item.id === id)
      const to = from + delta
      if (from === -1 || to < 0 || to >= orderedSiblings.length) return
      const newOrder = [...orderedSiblings]
      const [moved] = newOrder.splice(from, 1)
      newOrder.splice(to, 0, moved)
      await persistOrder(
        newOrder.map(i => i.id),
        parentId,
      )
    },
    [items, applyOrderToSiblings, persistOrder],
  )

  const handleDragEnd = useCallback(() => {
    setDraggedId(null)
    setDraggedParentId(null)
    setDragOverId(null)
  }, [])

  const roots = useMemo(() => {
    const nodeById = new Map<string, Node<T>>()
    for (const item of items) nodeById.set(item.id, { item, children: [] })

    const childrenByParent = new Map<string, T[]>()
    const rootItems: T[] = []
    for (const item of items) {
      if (item.parent_id === null) rootItems.push(item)
      else {
        const siblings = childrenByParent.get(item.parent_id) || []
        siblings.push(item)
        childrenByParent.set(item.parent_id, siblings)
      }
    }

    const orderedRootItems = applyOrderToSiblings(rootItems, null)
    const rootNodes: Node<T>[] = orderedRootItems.map(item => nodeById.get(item.id)!)

    for (const [parentId, children] of childrenByParent) {
      const parentNode = nodeById.get(parentId)
      if (parentNode) {
        const orderedChildren = applyOrderToSiblings(children, parentId)
        parentNode.children = orderedChildren.map(child => nodeById.get(child.id)!)
      }
    }

    return rootNodes
  }, [items, applyOrderToSiblings])

  function aggregateCurr(n: Node<T>): number {
    return aggregate_total(n, totals)
  }

  const hiddenCount = useMemo(() => (hideZero ? count_empty_subtrees(roots, totals) : 0), [hideZero, roots, totals])

  useEffect(() => {
    onHiddenCountChange?.(hiddenCount)
  }, [hiddenCount, onHiddenCountChange])

  const visibleChildrenOf = useCallback(
    (n: Node<T>) => (hideZero ? n.children.filter(child => !is_empty_subtree(child, totals)) : n.children),
    [hideZero, totals],
  )

  function renderNode(inputNode: Node<T>, depth: number = 0): React.ReactElement | null {
    // Prune the whole subtree only when nothing inside it carries value — a node with a
    // non-zero descendant always stays reachable, even when its children cancel out.
    if (hideZero && is_empty_subtree(inputNode, totals)) return null

    // A group with nothing of its own and a single child renders as that child — the two
    // rows would otherwise repeat the same name-and-amount. Suspended while reordering,
    // where the real parent/child structure is what you're editing.
    const node = reorderEnabled ? inputNode : fold_single_child(inputNode, totals, visibleChildrenOf)

    const item = node.item
    const isExpanded = !!expanded[item.id]
    const isDragging = draggedId === item.id
    const isDragOver = dragOverId === item.id

    const ownCurr = totals.get(item.id) || 0
    const displayCurr = aggregateCurr(node)

    const visibleChildren = visibleChildrenOf(node)
    const showSelfRow = !hideZero || !is_zero_total(ownCurr)

    const canDrag = reorderEnabled && !!scope

    const baseClasses = 'flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors'
    const depthClasses =
      depth === 0
        ? `bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700${accentBorderClass ? ` border-l-4 ${accentBorderClass}` : ''}`
        : ''
    const dragClasses = isDragging ? 'opacity-50' : ''
    const dragOverClasses = isDragOver ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800' : ''
    const cursorClasses = canDrag ? 'cursor-grab active:cursor-grabbing' : ''

    if (!item.is_active) {
      if (displayCurr !== 0) {
        return (
          <li key={item.id} className="mb-2">
            <div className={`${baseClasses} ${depthClasses} opacity-50`}>
              <span className="text-sm italic text-slate-600 dark:text-slate-400">{item.name} (inactive)</span>
              <span className="ml-auto font-semibold text-sm text-slate-900 dark:text-slate-100">
                <MaskedAmount value={displayCurr} />
              </span>
            </div>
          </li>
        )
      }
      return null
    }
    const rowToggles = visibleChildren.length > 0 && !expandAll && !canDrag
    return (
      <li key={item.id} className="mb-2">
        <div
          className={`${baseClasses} ${depthClasses} ${dragClasses} ${dragOverClasses} ${cursorClasses}${rowToggles ? ' cursor-pointer' : ''}`}
          draggable={canDrag}
          // The whole row is the expand/collapse target (the chevron alone is a 24px hit);
          // links and buttons inside stop propagation so navigation still works.
          onClick={rowToggles ? () => toggle(item.id) : undefined}
          onDragStart={canDrag ? e => handleDragStart(e, item.id, item.parent_id) : undefined}
          onDragOver={canDrag ? e => handleDragOver(e, item.id, item.parent_id) : undefined}
          onDragLeave={canDrag ? handleDragLeave : undefined}
          onDrop={canDrag ? e => handleDrop(e, item.id, item.parent_id) : undefined}
          onDragEnd={canDrag ? handleDragEnd : undefined}
        >
          {canDrag && (
            <span className="shrink-0 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-slate-400 dark:text-slate-500">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
              </svg>
            </span>
          )}

          {visibleChildren.length > 0 ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                toggle(item.id)
              }}
              aria-expanded={isExpanded}
              aria-controls={`tree-children-${item.id}`}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${item.name}`}
              className="shrink-0 w-6 h-6 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
            >
              <svg
                className={`w-3 h-3 sm:w-4 sm:h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <span className="w-5 sm:w-6 shrink-0"></span>
          )}

          <div className="flex-1 min-w-0 flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex-1 min-w-0">
              <Link
                href={getItemUrl(item.id)}
                className="font-medium text-sm sm:text-base text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-block"
                onClick={e => e.stopPropagation()}
                draggable={false}
              >
                {item.name}
              </Link>
              {renderExtraInfo && visibleChildren.length === 0 && <span className="ml-2 sm:ml-3">{renderExtraInfo(item, node)}</span>}
            </div>
            <div className="shrink-0 text-right flex items-center gap-1">
              {canDrag && (
                <span className="flex flex-col">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      void moveBy(item.id, item.parent_id, -1)
                    }}
                    disabled={saving}
                    aria-label={`Move ${item.name} up`}
                    className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-40"
                  >
                    <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      void moveBy(item.id, item.parent_id, 1)
                    }}
                    disabled={saving}
                    aria-label={`Move ${item.name} down`}
                    className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-40"
                  >
                    <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </span>
              )}
              <span className="font-semibold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                <MaskedAmount value={displayCurr} />
              </span>
            </div>
          </div>
        </div>

        {visibleChildren.length > 0 && isExpanded && (
          <ul
            id={`tree-children-${item.id}`}
            className="mt-2 ml-4 sm:ml-6 md:ml-9 space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-2 sm:pl-3 md:pl-4"
          >
            {showSelfRow && (
              <li key={`${item.id}-self`} className="mb-2">
                <div className="flex items-center gap-2 sm:gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                  {canDrag && <span className="w-5 sm:w-6 shrink-0"></span>}
                  <span className="w-5 sm:w-6 shrink-0"></span>
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs sm:text-sm italic text-slate-600 dark:text-slate-400">Held directly</span>
                      {renderExtraInfo && <span className="ml-2 sm:ml-3">{renderExtraInfo(item, node)}</span>}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                        <MaskedAmount value={ownCurr} />
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            )}
            {visibleChildren.map(child => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <div>
      {scope && onReorderToggle && (
        <div className="flex items-center gap-3 mb-4 pb-4 flex-wrap border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => onReorderToggle?.(!reorderEnabled)}
            disabled={saving}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              reorderEnabled
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            {reorderEnabled ? 'Done reordering' : 'Reorder'}
          </button>
          {reorderEnabled && (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {saving ? 'Saving…' : 'Drag rows, or use the arrows, to reorder within a level'}
            </span>
          )}
        </div>
      )}
      <ul className="space-y-2">{roots.map(r => renderNode(r, 0))}</ul>
      {hideZero && hiddenCount > 0 && roots.every(r => is_empty_subtree(r, totals)) && (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-2">
          Everything here totals zero — {hiddenCount} {hiddenCount === 1 ? 'entry is' : 'entries are'} hidden. Use “Show empty” to see them.
        </p>
      )}
    </div>
  )
}

function parentKey(parent_id: string | null): string {
  return parent_id ?? '__root__'
}

const HIDE_EMPTY_STORAGE_KEY = 'hierarchy-hide-empty'

/**
 * "Hide empty" preference, shared by every hierarchy page and persisted across navigation.
 * Defaults to off — opt in via the toggle. Hiding by default would swallow a head or asset the
 * moment it is created (a brand-new one totals zero, and the create form lands back on this list),
 * as well as real-but-settled rows like a paid-off card. The stored value is read in an effect so
 * the server and first client render match.
 */
export function useHideEmpty(): { hideZero: boolean; toggleHideZero: () => void } {
  const [hideZero, setHideZero] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HIDE_EMPTY_STORAGE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === 'true') setHideZero(true)
    } catch {}
  }, [])

  const toggleHideZero = useCallback(() => {
    const next = !hideZero
    setHideZero(next)
    try {
      localStorage.setItem(HIDE_EMPTY_STORAGE_KEY, String(next))
    } catch {}
  }, [hideZero])

  return { hideZero, toggleHideZero }
}
