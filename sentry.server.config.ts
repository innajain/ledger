import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.experimentalUseDiagnosticsChannelInjection()

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  sendDefaultPii: false,
  enableLogs: true,
  enableMetrics: true,
  tracesSampleRate: 1,
  integrations: [
    Sentry.pinoIntegration({
      error: { levels: ['error', 'fatal'], handled: true },
      log: { levels: ['info', 'warn', 'error', 'fatal'] },
    }),
  ],
})
