'use client'

import Link from 'next/link'
import { MaskedAmount } from './MaskedAmount'
import { LocalDateTime } from './LocalDateTime'
import { HomeSectionHead, HOME_ROW, HOME_TAG } from './HomeSection'

export type HomeRequest = {
  link_id: string
  status: 'pending' | 'rejected'
  kind: 'change' | 'deletion'
  other_username: string
  description: string | null
  datetime: string | null
  /** Net rupee movement on the lines that touch the viewer's linked account. */
  amount: number
}

export function HomeRequests({ requests }: { requests: HomeRequest[] }) {
  return (
    <section>
      <HomeSectionHead
        title="Requests"
        href="/requests"
        linkLabel="Inbox"
        extra={requests.length > 0 && <span className="text-sm text-ink-3 num">{requests.length} waiting</span>}
      />

      {requests.length === 0 ? (
        <p className="py-3 text-sm text-ink-3">Nothing awaiting you.</p>
      ) : (
        <ul className="-mx-2 max-h-[232px] overflow-y-auto px-2">
          {requests.map(r => (
            // Approving needs a balancing-account choice, so this only links through
            // to /requests rather than duplicating that form here.
            <li key={r.link_id} className={HOME_ROW}>
              <Link href="/requests" className="absolute inset-0 z-0" aria-label={`Request from ${r.other_username}`} />
              <div className="relative z-10 pointer-events-none flex items-baseline justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate flex items-center gap-2">
                    <span className="truncate">{r.description || 'No description'}</span>
                    {r.kind === 'deletion' && <span className={`${HOME_TAG} text-warn border-warn/40`}>Deletion</span>}
                    {r.status === 'rejected' && <span className={`${HOME_TAG} text-neg border-neg/40`}>Rejected</span>}
                  </p>
                  <p className="text-xs text-ink-3 mt-0.5">
                    from {r.other_username}
                    {r.datetime && (
                      <>
                        {' · '}
                        <LocalDateTime value={new Date(r.datetime)} />
                      </>
                    )}
                  </p>
                </div>
                {r.amount !== 0 && (
                  <span className={`shrink-0 text-sm pointer-events-auto ${r.amount > 0 ? 'text-pos' : 'text-ink'}`}>
                    <MaskedAmount value={r.amount} keep_sign />
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
