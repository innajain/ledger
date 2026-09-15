import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

// No Replay and no console forwarding on purpose: this is a personal finance
// ledger, so recorded DOM and raw console text are the two channels most likely
// to carry account names, amounts and descriptions past the server-side
// redaction in lib/logger.ts. Errors and traces carry no such payload.
Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  enableLogs: false,
  enableMetrics: true,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
