import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  enableLogs: true,
  enableMetrics: true,
  tracesSampleRate: 1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
    Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
  ],
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
