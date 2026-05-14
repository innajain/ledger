'use client'

import React, { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { update_hierarchy_order } from '@/app/_actions/resources'
import { useToast } from './Toast'
import { currency_fmt } from '../_utils/currency_formatter'

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
  // Setting `scope` enables the reorder button and persists order to the DB
  // via the update_hierarchy_order server action.
  scope?: 'account' | 'asset'
  reorderEnabled?: boolean
  onReorderToggle?: (enabled: boolean) => void
  accentBorderClass?: string
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
}: HierarchyTreeProps<T>) {
  const router = useRouter()
  const { showToast } = useToast()

  // Manual expand/collapse overrides - only used when user manually toggles
  const [manualExpanded, setManualExpanded] = useState<Record<string, boolean>>({})

  // Optimistic per-parent ordering after a drop, kept until the server refresh
  // brings back the new order in `items`. Cleared whenever items change.
  const [optimisticOrder, setOptimisticOrder] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
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

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>, targetId: string, parentId: string | null) => {
      e.preventDefault()

      if (!draggedId || draggedId === targetId || parentId !== draggedParentId) {
        setDraggedId(null)
        setDraggedParentId(null)
        setDragOverId(null)
        return
      }

      const orderedSiblings = applyOrderToSiblings(items.filter(item => item.parent_id === parentId), parentId)
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
      const orderIds = newOrder.map(i => i.id)

      setOptimisticOrder(prev => ({ ...prev, [parentKey(parentId)]: orderIds }))
      setDraggedId(null)
      setDraggedParentId(null)
      setDragOverId(null)

      if (!scope) return

      setSaving(true)
      try {
        const result = await update_hierarchy_order({ scope, parent_id: parentId, ordered_ids: orderIds })
        if (!result.success) {
          showToast(result.message, 'error')
          // Revert optimistic order — items prop hasn't changed.
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
    [draggedId, draggedParentId, items, applyOrderToSiblings, scope, router, showToast],
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
    const own = totals.get(n.item.id) || 0
    return n.children.reduce((sum, c) => sum + aggregateCurr(c), own)
  }

  function renderNode(node: Node<T>, depth: number = 0): React.ReactElement | null {
    const item = node.item
    const isExpanded = !!expanded[item.id]
    const isDragging = draggedId === item.id
    const isDragOver = dragOverId === item.id

    const ownCurr = totals.get(item.id) || 0
    const displayCurr = aggregateCurr(node)

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
              <span className="ml-auto font-semibold text-sm text-slate-900 dark:text-slate-100">{currency_fmt.format(displayCurr)}</span>
            </div>
          </li>
        )
      }
      return null
    }
    return (
      <li key={item.id} className="mb-2">
        <div
          className={`${baseClasses} ${depthClasses} ${dragClasses} ${dragOverClasses} ${cursorClasses}`}
          draggable={canDrag}
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

          {node.children.length > 0 ? (
            <button
              onClick={() => toggle(item.id)}
              aria-expanded={isExpanded}
              className="shrink-0 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
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
                onClick={e => {
                  if (canDrag) e.stopPropagation()
                }}
                draggable={false}
              >
                {item.name}
              </Link>
              {renderExtraInfo && node.children.length === 0 && <span className="ml-2 sm:ml-3">{renderExtraInfo(item, node)}</span>}
            </div>
            <div className="shrink-0 text-right">
              <span className="font-semibold text-sm sm:text-base text-slate-900 dark:text-slate-100">{currency_fmt.format(displayCurr)}</span>
            </div>
          </div>
        </div>

        {node.children.length > 0 && isExpanded && (
          <ul className="mt-2 ml-4 sm:ml-6 md:ml-9 space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-2 sm:pl-3 md:pl-4">
            <li key={`${item.id}-self`} className="mb-2">
              <div className="flex items-center gap-2 sm:gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                {canDrag && <span className="w-5 sm:w-6 shrink-0"></span>}
                <span className="w-5 sm:w-6 shrink-0"></span>
                <div className="flex-1 min-w-0 flex items-center justify-between gap-2 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs sm:text-sm italic text-slate-600 dark:text-slate-400">self</span>
                    {renderExtraInfo && <span className="ml-2 sm:ml-3">{renderExtraInfo(item, node)}</span>}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">{currency_fmt.format(ownCurr)}</span>
                  </div>
                </div>
              </div>
            </li>
            {node.children.map(child => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <div>
      {scope && (
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
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
            {reorderEnabled ? 'Done Reordering' : 'Reorder'}
          </button>
          {reorderEnabled && (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {saving ? 'Saving…' : 'Drag items to reorder (within same level)'}
            </span>
          )}
        </div>
      )}
      <ul className="space-y-2">{roots.map(r => renderNode(r, 0))}</ul>
    </div>
  )
}

function parentKey(parent_id: string | null): string {
  return parent_id ?? '__root__'
}
