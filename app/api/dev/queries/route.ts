import { DEV_QUERY_TOASTS_ENABLED, queryBus, getRecentEvents, type QueryEvent } from '@/lib/dev/query-bus'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  if (!DEV_QUERY_TOASTS_ENABLED) return new Response('not found', { status: 404 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const send = (ev: QueryEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
        } catch {}
      }

      for (const ev of getRecentEvents()) send({ ...ev, replayed: true })
      queryBus.on('event', send)

      const cleanup = () => {
        queryBus.off('event', send)
        try {
          controller.close()
        } catch {}
      }
      request.signal.addEventListener('abort', cleanup)

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
