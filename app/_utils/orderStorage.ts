/**
 * Utility for persisting custom order of items in localStorage
 */

const STORAGE_PREFIX = 'ledger_order_';

/**
 * Get the stored order for a given key
 * Returns an array of item IDs in the custom order, or empty array if none stored
 */
export function getStoredOrder(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load stored order:', e);
  }
  return [];
}

/**
 * Save the custom order for a given key
 */
export function saveOrder(key: string, order: string[]): void {
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
 * Apply stored order to items. Items not in the stored order will be appended at the end.
 */
export function applyStoredOrder<T extends { id: string }>(items: T[], storedOrder: string[]): T[] {
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
