/**
 * Framework-agnostic user-preference reads/writes, shared by the web actions
 * (`app/_actions/preferences.ts`, which add `revalidatePath`) and the CLI.
 * Takes an explicit `user_id`; no `next/cache`.
 */
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ActionResult, ok, err, fromError } from '@/app/_actions/_result'

export type LineItemDefaults = {
  default_account_id: string | null
  default_allocation_id: string | null
  default_income_expense_id: string | null
  default_asset_id: string | null
}

export type ThemeChoice = 'light' | 'dark' | 'system'

export type UserPreferences = {
  theme: ThemeChoice
  masking_enabled: boolean
  mask_threshold: number
  graphs_visible: boolean
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: 'system',
  masking_enabled: true,
  mask_threshold: 50_000,
  graphs_visible: false,
}

const EMPTY_DEFAULTS: LineItemDefaults = {
  default_account_id: null,
  default_allocation_id: null,
  default_income_expense_id: null,
  default_asset_id: null,
}

const userPrefsUpdateSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'system']),
    masking_enabled: z.boolean(),
    mask_threshold: z.number().int().nonnegative(),
    graphs_visible: z.boolean(),
  })
  .partial()

const updateSchema = z.object({
  default_account_id: z.string().min(1).nullable(),
  default_allocation_id: z.string().min(1).nullable(),
  default_income_expense_id: z.string().min(1).nullable(),
  default_asset_id: z.string().min(1).nullable(),
})

// Basic VPA shape: handle@psp (e.g. name@oksbi, 9876543210@upi).
const upiSchema = z
  .string()
  .trim()
  .max(100)
  .regex(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z0-9.\-]{2,}$/, 'Enter a valid UPI ID like name@bank')

export async function update_own_upi_core(user_id: string, upi_id: string | null): Promise<ActionResult<{ upi_id: string | null }>> {
  try {
    let value: string | null = null
    if (upi_id && upi_id.trim() !== '') {
      const parsed = upiSchema.safeParse(upi_id)
      if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
      value = parsed.data
    }
    const updated = await prisma.user.update({ where: { id: user_id }, data: { upi_id: value }, select: { upi_id: true } })
    return ok({ upi_id: updated.upi_id }, 'UPI ID saved')
  } catch (error) {
    return fromError(error)
  }
}

export async function get_line_item_defaults_core(user_id: string): Promise<LineItemDefaults> {
  const u = await prisma.user.findUnique({
    where: { id: user_id },
    select: { default_account_id: true, default_allocation_id: true, default_income_expense_id: true, default_asset_id: true },
  })
  return u ?? EMPTY_DEFAULTS
}

export async function update_line_item_defaults_core(user_id: string, input: LineItemDefaults): Promise<ActionResult<LineItemDefaults>> {
  try {
    const parsed = updateSchema.parse(input)

    // Validate ownership and accounting_head_type for the chosen IDs.
    const accountIds = [
      { id: parsed.default_account_id, type: 'account' as const, label: 'account' },
      { id: parsed.default_allocation_id, type: 'allocation' as const, label: 'allocation' },
      { id: parsed.default_income_expense_id, type: 'income_expense' as const, label: 'income_expense' },
    ].filter(x => x.id)
    if (accountIds.length > 0) {
      const found = await prisma.accounting_head.findMany({
        where: { id: { in: accountIds.map(x => x.id!) }, user_id },
        select: { id: true, type: true },
      })
      const byId = new Map(found.map(a => [a.id, a]))
      for (const x of accountIds) {
        const acc = byId.get(x.id!)
        if (!acc) return err('NOT_FOUND', `Default ${x.label} account not found`)
        if (acc.type !== x.type) return err('VALIDATION', `Default ${x.label} account must be of type ${x.label}`)
      }
    }
    if (parsed.default_asset_id) {
      const asset = await prisma.asset.findFirst({ where: { id: parsed.default_asset_id }, select: { id: true } })
      if (!asset) return err('NOT_FOUND', 'Default asset not found')
    }

    const updated = await prisma.user.update({
      where: { id: user_id },
      data: parsed,
      select: { default_account_id: true, default_allocation_id: true, default_income_expense_id: true, default_asset_id: true },
    })
    return ok(updated, 'Defaults saved')
  } catch (error) {
    return fromError(error)
  }
}

export async function get_user_preferences_core(user_id: string): Promise<UserPreferences> {
  const u = await prisma.user.findUnique({
    where: { id: user_id },
    select: { theme: true, masking_enabled: true, mask_threshold: true, graphs_visible: true },
  })
  if (!u) return DEFAULT_USER_PREFERENCES
  const theme: ThemeChoice = u.theme === 'light' || u.theme === 'dark' ? u.theme : 'system'
  return { theme, masking_enabled: u.masking_enabled, mask_threshold: u.mask_threshold, graphs_visible: u.graphs_visible }
}

export async function update_user_preferences_core(user_id: string, input: Partial<UserPreferences>): Promise<ActionResult<UserPreferences>> {
  try {
    const parsed = userPrefsUpdateSchema.parse(input)
    const updated = await prisma.user.update({
      where: { id: user_id },
      data: parsed,
      select: { theme: true, masking_enabled: true, mask_threshold: true, graphs_visible: true },
    })
    const theme: ThemeChoice = updated.theme === 'light' || updated.theme === 'dark' ? updated.theme : 'system'
    return ok(
      { theme, masking_enabled: updated.masking_enabled, mask_threshold: updated.mask_threshold, graphs_visible: updated.graphs_visible },
      'Preferences saved',
    )
  } catch (error) {
    return fromError(error)
  }
}
