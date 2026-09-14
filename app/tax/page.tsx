import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { profile } from '@/lib/metrics/profile'
import { LoggedOutNotice } from '@/app/_components/LoggedOutNotice'
import { compute_tax_for_fy, serialize_tax_result } from '@/app/_core/tax_core'
import { current_financial_year, fy_label } from '@/app/_utils/financial_year'
import type { Metadata } from 'next'
import type { tax_treatment } from '@/generated/prisma/enums'
import ClientPage from './ClientPage'

export const metadata: Metadata = {
  title: 'Tax',
}

async function TaxPage({ searchParams }: { searchParams: Promise<{ fy?: string; projected?: string }> }) {
  const user = await get_current_user()
  if (!user) return <LoggedOutNotice title="Tax" />

  const params = await searchParams
  const current_fy = current_financial_year(new Date())
  const parsed_fy = Number(params.fy)
  const selected_fy = Number.isInteger(parsed_fy) ? parsed_fy : current_fy
  const include_future = params.projected === '1'

  // Also fetch the current FY's labelled options for the selector.
  const fy_options = [current_fy - 1, current_fy, current_fy + 1]

  const [result, heads] = await Promise.all([
    compute_tax_for_fy(user.id, selected_fy, include_future),
    prisma.accounting_head.findMany({
      where: { user_id: user.id, type: 'income_expense' },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: { id: true, name: true, tax_treatment: true },
    }),
  ])

  return (
    <ClientPage
      selected_fy={selected_fy}
      include_future={include_future}
      fy_options={fy_options.map(f => ({ value: f, label: fy_label(f) }))}
      result={serialize_tax_result(result)}
      heads={heads as { id: string; name: string; tax_treatment: tax_treatment | null }[]}
    />
  )
}

export default profile('/tax', TaxPage)
