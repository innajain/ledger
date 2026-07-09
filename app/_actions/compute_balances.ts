import 'server-only'
import { cache } from 'react'
import { get_current_user_id } from '@/app/_actions/auth'
import { compute_balances_core } from '@/app/_core/balances_core'

export { invalidate_balances } from '@/app/_core/balances_core'

export const get_or_compute_balances = cache(async (invalidate_cache = false) => {
  const user_id = await get_current_user_id()
  if (!user_id) throw new Error('unauthorized')
  return compute_balances_core(user_id, invalidate_cache)
})
