import * as Sentry from '@sentry/nextjs'
import { SENTRY_DATA_COLLECTION } from './sentry.data-collection'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  dataCollection: SENTRY_DATA_COLLECTION,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  integrations: [
    Sentry.pinoIntegration({
      error: { levels: ['error', 'fatal'], handled: true },
      // warn and above only: persistMetrics emits one info log per render, so
      // forwarding info would spend the log quota on routine request traffic.
      // Those stay on stdout, where the platform log drain picks them up.
      log: { levels: ['warn', 'error', 'fatal'] },
    }),
  ],
})
