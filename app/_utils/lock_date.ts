import { ActionError } from '@/app/_actions/_result'
import { get_indian_date_from_date_obj, next_ist_midnight } from '@/app/_utils/date'

export type LockCheckLine = {
  datetime?: Date | null | undefined
  accounting_head: { name: string; lock_date: Date | null }
}

// A line is locked when its effective datetime (line override ?? txn datetime)
// falls on or before its head's lock_date, end of that IST day.
export function find_locked_line(txn_datetime: Date, lines: LockCheckLine[]): { head_name: string; lock_date: Date } | null {
  for (const li of lines) {
    const lock = li.accounting_head.lock_date
    if (!lock) continue
    if ((li.datetime ?? txn_datetime) < next_ist_midnight(lock)) return { head_name: li.accounting_head.name, lock_date: lock }
  }
  return null
}

export function assert_no_locked_lines(action: string, txn_datetime: Date, lines: LockCheckLine[]): void {
  const hit = find_locked_line(txn_datetime, lines)
  if (hit)
    throw new ActionError(
      'VALIDATION',
      `Account "${hit.head_name}" is reconciled and locked through ${get_indian_date_from_date_obj(hit.lock_date)} — cannot ${action} a transaction dated in the locked period. If this change is intentional, move the account's lock date back first.`,
    )
}
