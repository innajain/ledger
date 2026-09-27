import * as Sentry from '@sentry/nextjs'
import { SENTRY_DATA_COLLECTION, withoutConsoleBreadcrumbs } from './sentry.data-collection'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  dataCollection: SENTRY_DATA_COLLECTION,
  integrations: withoutConsoleBreadcrumbs,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
})
