'use client'

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { InboxItem } from '@/app/_utils/links'
import { CheckCircleIcon, CloseIcon } from '@/app/_components/icons'

export type SwipeDecision = 'approve' | 'reject'
type Result = { success: boolean; message?: string }

/** Past this many pixels a released card counts as a swipe; short of it, it springs back. */
const SWIPE_THRESHOLD = 96
/** An upward drag this far sends the top card to the back of the deck. */
const SKIP_THRESHOLD = 80
/** How long a swipe can be taken back before it is sent — approvals and rejections reach the other side. */
const UNDO_MS = 5000
const FLY_MS = 220

/**
 * What a right swipe does to this request. A deletion approves outright; a brand-new
 * transaction approves balanced onto the chosen account (as Accept all does); an edit
 * needs your own balancing lines, so it opens the review page instead.
 */
function right_action(item: InboxItem, account: { id: string; name: string } | null): 'approve' | 'review' | 'blocked' {
  if (item.kind === 'deletion') return 'approve'
  if (!item.has_reciprocal) return 'blocked'
  if (item.previous || !account) return 'review'
  return 'approve'
}

function right_label(item: InboxItem, account: { id: string; name: string } | null): string {
  const a = right_action(item, account)
  if (a === 'review') return 'Review'
  if (a === 'blocked') return 'Can’t approve'
  return item.kind === 'deletion' ? 'Delete' : 'Approve'
}

/**
 * Tinder-style deck for the phone layout: one request at a time, drag right to approve and
 * left to reject. Every swipe waits UNDO_MS before it is sent, because both outcomes are
 * visible to the other person and a deletion approval can't be taken back.
 */
export function SwipeStack({
  items,
  account,
  renderCard,
  onCommit,
  onError,
}: {
  items: InboxItem[]
  account: { id: string; name: string } | null
  renderCard: (item: InboxItem) => ReactNode
  onCommit: (item: InboxItem, decision: SwipeDecision) => Promise<Result>
  onError: (message: string) => void
}) {
  const router = useRouter()
  const [gone, setGone] = useState<Set<string>>(() => new Set())
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [dy, setDy] = useState(0)
  const [fly, setFly] = useState<1 | -1 | 'up' | null>(null)
  // Cards swiped up, in the order they were sent to the back.
  const [skipped, setSkipped] = useState<string[]>([])
  const [pending, setPending] = useState<{ item: InboxItem; decision: SwipeDecision } | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const moved = useRef(false)
  // Which way the current drag locked to: sideways decides, upward skips.
  const axis = useRef<'x' | 'y' | null>(null)
  // Mirror dx/dy for the release handler: a fast flick can end before the last set renders.
  const dxRef = useRef(0)
  const dyRef = useRef(0)
  const moveTo = (x: number, y = 0) => {
    dxRef.current = x
    dyRef.current = y
    setDx(x)
    setDy(y)
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The latest pending swipe, readable from timers and unmount without re-subscribing.
  const pendingRef = useRef(pending)
  const track = (p: { item: InboxItem; decision: SwipeDecision } | null) => {
    pendingRef.current = p
    setPending(p)
  }

  const live = items.filter(i => !gone.has(i.link_id))
  const skipRank = new Map(skipped.map((id, i) => [id, i]))
  // Never-skipped cards keep server order; skipped ones follow in the order they were sent back.
  const visible = [
    ...live.filter(i => !skipRank.has(i.link_id)),
    ...live.filter(i => skipRank.has(i.link_id)).sort((a, b) => skipRank.get(a.link_id)! - skipRank.get(b.link_id)!),
  ]
  const top = visible[0]

  async function commit(p: { item: InboxItem; decision: SwipeDecision }) {
    const r = await onCommit(p.item, p.decision)
    if (r.success) router.refresh()
    else {
      // Put the card back so the failure is visible where it happened.
      setGone(prev => {
        const next = new Set(prev)
        next.delete(p.item.link_id)
        return next
      })
      onError(r.message ?? "Couldn't update this request")
    }
  }

  function flush() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const p = pendingRef.current
    if (p) {
      track(null)
      void commit(p)
    }
  }

  // Leaving the page mid-undo still sends the swipe — it was a decision, not a draft.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      const p = pendingRef.current
      if (p) void onCommit(p.item, p.decision)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  function decide(item: InboxItem, dir: 1 | -1) {
    setHint(null)
    if (dir === 1) {
      const action = right_action(item, account)
      if (action === 'blocked') {
        moveTo(0)
        setHint(`Link one of your accounts to @${item.other_username} before you can approve this.`)
        return
      }
      if (action === 'review') {
        moveTo(0)
        router.push(`/requests/${item.link_id}`)
        return
      }
    }
    flush()
    setFly(dir)
    setTimeout(() => {
      setGone(prev => new Set(prev).add(item.link_id))
      setFly(null)
      moveTo(0)
      const p = { item, decision: dir === 1 ? ('approve' as const) : ('reject' as const) }
      track(p)
      timer.current = setTimeout(flush, UNDO_MS)
    }, FLY_MS)
  }

  function skip(item: InboxItem) {
    setHint(null)
    if (visible.length < 2) {
      moveTo(0)
      return
    }
    setFly('up')
    setTimeout(() => {
      setSkipped(prev => [...prev.filter(id => id !== item.link_id), item.link_id])
      setFly(null)
      moveTo(0)
    }, FLY_MS)
  }

  function undo() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const p = pendingRef.current
    if (!p) return
    track(null)
    setGone(prev => {
      const next = new Set(prev)
      next.delete(p.item.link_id)
      return next
    })
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || fly) return
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    moved.current = false
    axis.current = null
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const s = start.current
    // A second finger (or a stray mouse) must not steer the drag.
    if (!s || e.pointerId !== s.id) return
    const ddx = e.clientX - s.x
    const ddy = e.clientY - s.y
    if (!moved.current) {
      // Decide once which way the gesture goes: sideways decides, upward skips, and
      // downward is left to the browser (touch-action: pan-down) so the page still scrolls.
      if (Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy)) axis.current = 'x'
      else if (ddy < -10) axis.current = 'y'
      else {
        if (ddy > 10) start.current = null
        return
      }
      moved.current = true
      setDragging(true)
      // Keeps the drag alive when the finger leaves the card; throws if the pointer is already gone.
      try {
        e.currentTarget.setPointerCapture(s.id)
      } catch {}
    }
    if (axis.current === 'x') moveTo(ddx)
    else moveTo(0, Math.min(0, ddy))
  }

  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    if (!start.current || e.pointerId !== start.current.id) return
    start.current = null
    setDragging(false)
    if (!moved.current || !top) return
    if (axis.current === 'y') {
      if (-dyRef.current > SKIP_THRESHOLD) skip(top)
      else moveTo(0)
      return
    }
    const x = dxRef.current
    if (Math.abs(x) > SWIPE_THRESHOLD) decide(top, x > 0 ? 1 : -1)
    else moveTo(0)
  }

  const progress = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD)
  const topStyle =
    fly === 'up'
      ? { transform: 'translateY(-60%) scale(0.9)', transition: `transform ${FLY_MS}ms ease-in, opacity ${FLY_MS}ms`, opacity: 0 }
      : fly !== null
        ? { transform: `translateX(${fly * 130}%) rotate(${fly * 24}deg)`, transition: `transform ${FLY_MS}ms ease-in`, opacity: 0.6 }
        : {
            transform: `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`,
            transition: dragging ? 'none' : 'transform 200ms ease-out',
          }

  return (
    <div className="space-y-3">
      <div className="relative isolate">
        {/* The next two cards peek out underneath, so the stack reads as a stack. */}
        {visible.slice(1, 3).map((item, i) => (
          <div
            key={item.link_id}
            aria-hidden="true"
            className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none"
            style={{
              transform: `translateY(${(i + 1) * 10}px) scale(${1 - (i + 1) * 0.04})`,
              transformOrigin: 'bottom center',
              zIndex: -1 - i,
              // Opaque, so a lifted top card reveals the next card cleanly rather than two bleeding through.
              filter: `brightness(${1 - (i + 1) * 0.08})`,
            }}
          >
            {renderCard(item)}
          </div>
        ))}

        {top ? (
          <div
            key={top.link_id}
            className="relative touch-pan-down select-none cursor-grab active:cursor-grabbing"
            style={topStyle}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onClickCapture={e => {
              // A drag that ends over a button must not also press it.
              if (moved.current) {
                e.preventDefault()
                e.stopPropagation()
                moved.current = false
              }
            }}
          >
            {renderCard(top)}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-4 left-4 rotate-[-12deg] rounded-md border-2 border-green-500 px-2 py-0.5 text-sm font-extrabold uppercase tracking-widest text-green-600 dark:text-green-400 bg-white/80 dark:bg-slate-900/80"
              style={{ opacity: dx > 0 ? progress : 0 }}
            >
              {right_label(top, account)}
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-4 right-4 rotate-12 rounded-md border-2 border-red-500 px-2 py-0.5 text-sm font-extrabold uppercase tracking-widest text-red-600 dark:text-red-400 bg-white/80 dark:bg-slate-900/80"
              style={{ opacity: dx < 0 ? progress : 0 }}
            >
              Reject
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-md border-2 border-slate-400 px-2 py-0.5 text-sm font-extrabold uppercase tracking-widest text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-900/80"
              style={{ opacity: dy < 0 && visible.length > 1 ? Math.min(1, -dy / SKIP_THRESHOLD) : 0 }}
            >
              Later
            </span>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center">
            <CheckCircleIcon className="mx-auto w-8 h-8 text-green-500" />
            <p className="mt-2 font-semibold text-slate-900 dark:text-slate-100">All caught up</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Nothing left to approve.</p>
          </div>
        )}
      </div>

      {top && (
        <div className="flex items-center justify-between gap-4 px-6 pt-5">
          <button
            type="button"
            onClick={() => decide(top, -1)}
            disabled={fly !== null}
            aria-label="Reject"
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-red-300 dark:border-red-700 bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 shadow-sm active:scale-95 transition-transform"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => skip(top)}
              disabled={fly !== null || visible.length < 2}
              aria-label="Move to the back"
              className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 shadow-sm active:scale-95 transition-transform disabled:opacity-40"
            >
              <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19V5m-6 6l6-6 6 6" />
              </svg>
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums text-center">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{visible.length} left</span> · ↑ later
            </p>
          </div>
          <button
            type="button"
            onClick={() => decide(top, 1)}
            disabled={fly !== null}
            aria-label={right_label(top, account)}
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-green-300 dark:border-green-700 bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 shadow-sm active:scale-95 transition-transform"
          >
            <svg aria-hidden="true" className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      )}

      {hint && <p className="text-sm text-center text-amber-700 dark:text-amber-400">{hint}</p>}

      {pending && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-3 text-sm text-white dark:text-slate-900 shadow-lg"
        >
          <span className="min-w-0 truncate">
            {pending.decision === 'reject'
              ? 'Rejected'
              : pending.item.kind === 'deletion'
                ? 'Deletion approved'
                : `Approved into ${account?.name ?? 'your account'}`}
            {pending.item.description ? ` · ${pending.item.description}` : ''}
          </span>
          <button type="button" onClick={undo} className="shrink-0 font-semibold text-blue-300 dark:text-blue-700 hover:underline">
            Undo
          </button>
        </div>
      )}
    </div>
  )
}
