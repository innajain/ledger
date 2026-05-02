/**
 * Utility for persisting custom order of items in localStorage
 * Supports hierarchical ordering - each parent group can have its own order
 */

const STORAGE_PREFIX = 'ledger_order_'
const CURRENT_VERSION = 2

// Type for hierarchical order storage: maps parent_id (or 'root' for root items) to ordered child IDs
export type HierarchicalOrder = Record<string, string[]>

type StoredEnvelope = { version: number; data: HierarchicalOrder }

/**
 * Get the stored hierarchical order for a given key
 * Returns an object mapping parent IDs to ordered child IDs
 */
export function getStoredOrder(key: string): HierarchicalOrder {
  if (typeof window === 'undefined') return {}
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + key)
    if (!stored) return {}
    const parsed = JSON.parse(stored)
    // v2: { version, data }
    if (parsed && typeof parsed === 'object' && 'version' in parsed && 'data' in parsed) {
      return migrate(parsed as { version: number; data: unknown })
    }
    // v1 legacy: { [parentId]: string[] }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as HierarchicalOrder
    }
    // v0 legacy: string[] (root only)
    if (Array.isArray(parsed)) {
      return { root: parsed }
    }
  } catch (e) {
    console.error('Failed to load stored order:', e)
  }
  return {}
}

function migrate({ version, data }: { version: number; data: unknown }): HierarchicalOrder {
  if (version === CURRENT_VERSION) return data as HierarchicalOrder
  // Future migrations dispatch here.
  return (data as HierarchicalOrder) ?? {}
}

/**
 * Save the custom hierarchical order for a given key
 */
export function saveOrder(key: string, order: HierarchicalOrder): void {
  if (typeof window === 'undefined') return
  try {
    const envelope: StoredEnvelope = { version: CURRENT_VERSION, data: order }
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(envelope))
  } catch (e) {
    console.error('Failed to save order:', e)
  }
}

/**
 * Clear the stored order for a given key
 */
export function clearStoredOrder(key: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_PREFIX + key)
  } catch (e) {
    console.error('Failed to clear stored order:', e)
  }
}

/**
 * Get the storage key for a parent (use 'root' for items with no parent)
 */
export function getParentKey(parentId: string | null): string {
  return parentId ?? 'root'
}

/**
 * Apply stored order to items within a specific parent group
 * Items not in the stored order will be appended at the end.
 */
export function applyStoredOrderToGroup<T extends { id: string }>(items: T[], storedOrder: string[]): T[] {
  if (!storedOrder.length) return items

  const itemsById = new Map(items.map(item => [item.id, item]))
  const orderedItems: T[] = []
  const usedIds = new Set<string>()

  // Add items in stored order
  for (const id of storedOrder) {
    const item = itemsById.get(id)
    if (item) {
      orderedItems.push(item)
      usedIds.add(id)
    }
  }

  // Add remaining items not in stored order
  for (const item of items) {
    if (!usedIds.has(item.id)) {
      orderedItems.push(item)
    }
  }

  return orderedItems
}

/**
 * Check if there's any custom order stored
 */
export function hasAnyCustomOrder(order: HierarchicalOrder): boolean {
  return Object.keys(order).length > 0 && Object.values(order).some(arr => arr.length > 0)
}
