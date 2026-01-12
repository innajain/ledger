/**
 * Utility for persisting custom order of items in localStorage
 * Supports hierarchical ordering - each parent group can have its own order
 */

const STORAGE_PREFIX = 'ledger_order_';

// Type for hierarchical order storage: maps parent_id (or 'root' for root items) to ordered child IDs
export type HierarchicalOrder = Record<string, string[]>;

/**
 * Get the stored hierarchical order for a given key
 * Returns an object mapping parent IDs to ordered child IDs
 */
export function getStoredOrder(key: string): HierarchicalOrder {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + key);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Handle legacy format (array) by converting to new format
      if (Array.isArray(parsed)) {
        return { root: parsed };
      }
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load stored order:', e);
  }
  return {};
}

/**
 * Save the custom hierarchical order for a given key
 */
export function saveOrder(key: string, order: HierarchicalOrder): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(order));
  } catch (e) {
    console.error('Failed to save order:', e);
  }
}

/**
 * Clear the stored order for a given key
 */
export function clearStoredOrder(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch (e) {
    console.error('Failed to clear stored order:', e);
  }
}

/**
 * Get the storage key for a parent (use 'root' for items with no parent)
 */
export function getParentKey(parentId: string | null): string {
  return parentId ?? 'root';
}

/**
 * Apply stored order to items within a specific parent group
 * Items not in the stored order will be appended at the end.
 */
export function applyStoredOrderToGroup<T extends { id: string }>(
  items: T[], 
  storedOrder: string[]
): T[] {
  if (!storedOrder.length) return items;
  
  const itemsById = new Map(items.map(item => [item.id, item]));
  const orderedItems: T[] = [];
  const usedIds = new Set<string>();
  
  // Add items in stored order
  for (const id of storedOrder) {
    const item = itemsById.get(id);
    if (item) {
      orderedItems.push(item);
      usedIds.add(id);
    }
  }
  
  // Add remaining items not in stored order
  for (const item of items) {
    if (!usedIds.has(item.id)) {
      orderedItems.push(item);
    }
  }
  
  return orderedItems;
}

/**
 * Check if there's any custom order stored
 */
export function hasAnyCustomOrder(order: HierarchicalOrder): boolean {
  return Object.keys(order).length > 0 && Object.values(order).some(arr => arr.length > 0);
}
