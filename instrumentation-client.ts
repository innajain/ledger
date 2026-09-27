import * as Sentry from '@sentry/nextjs'
import { SENTRY_DATA_COLLECTION } from './sentry.data-collection'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

// No Replay and no console forwarding on purpose: this is a personal finance
// ledger, so recorded DOM and raw console text are the two channels most likely
// to carry account names, amounts and descriptions past the server-side
// redaction in lib/logger.ts. Errors and traces carry no such payload.
Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  dataCollection: SENTRY_DATA_COLLECTION,
  // Was `enableLogs: false`. Sentry 11 removed the flag and logs are always on,
  // so the same intent now has to be a hook that drops every one of them. The
  // reason is unchanged: nothing on the client should be able to forward raw
  // text, which is where account names and amounts would ride out.
  beforeSendLog: () => null,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
