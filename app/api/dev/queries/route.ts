import { DEV_QUERY_TOASTS_ENABLED, queryBus, getRecentEvents, type QueryEvent } from '@/lib/dev/query-bus'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  // 404 in prod and when explicitly disabled via DEV_QUERY_TOASTS=off, so
  // a stale tab from before the flip can't keep streaming events forever.
  if (!DEV_QUERY_TOASTS_ENABLED) return new Response('not found', { status: 404 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const send = (ev: QueryEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
        } catch {
          // Stream already closed; drop the event.
        }
      }
      // Replay recent events so a freshly-connecting client sees queries that
      // fired during the SSR render that preceded this connection. Synchronous
      // — no event can sneak in between drain and attach.
      for (const ev of getRecentEvents()) send({ ...ev, replayed: true })
      queryBus.on('event', send)

      const cleanup = () => {
        queryBus.off('event', send)
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
      request.signal.addEventListener('abort', cleanup)

      // Flush headers so EventSource transitions to OPEN.
      controller.enqueue(encoder.encode(': connected\n\n'))
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
