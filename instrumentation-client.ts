import { SENTRY_DATA_COLLECTION, withoutConsoleBreadcrumbs } from './sentry.data-collection'

// Inlined at build time. Without a DSN the import below is dead code, so a build that
// reports nowhere (the VM's) ships and starts none of the Sentry SDK in the browser.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

type CaptureTransition = (href: string, navigationType: 'push' | 'replace' | 'traverse') => void
let captureTransition: CaptureTransition | undefined

if (dsn) {
  // Loaded off the critical path: the SDK is the largest piece of client JS, and error
  // reporting can start a moment after the page instead of delaying it.
  void import('@sentry/nextjs').then(Sentry => {
    // No Replay and no console forwarding on purpose: this is a personal finance
    // ledger, so recorded DOM and raw console text are the two channels most likely
    // to carry account names, amounts and descriptions past the server-side
    // redaction in lib/logger.ts. Errors and traces carry no such payload.
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
      dataCollection: SENTRY_DATA_COLLECTION,
      integrations: withoutConsoleBreadcrumbs,
      // Was `enableLogs: false`. Sentry 11 removed the flag and logs are always on,
      // so the same intent now has to be a hook that drops every one of them. The
      // reason is unchanged: nothing on the client should be able to forward raw
      // text, which is where account names and amounts would ride out.
      beforeSendLog: () => null,
      tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    })
    captureTransition = Sentry.captureRouterTransitionStart
  })
}

export function onRouterTransitionStart(href: string, navigationType: 'push' | 'replace' | 'traverse') {
  captureTransition?.(href, navigationType)
}
