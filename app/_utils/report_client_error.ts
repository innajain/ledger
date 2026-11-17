// Sends a caught render error to Sentry from the browser, loading the SDK only when the
// build has a DSN. Without one (the VM build) the import is dead code, so the error
// boundaries that every page carries do not pull the SDK into the page's JavaScript.
export function report_client_error(error: unknown): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
  void import('@sentry/nextjs').then(Sentry => Sentry.captureException(error))
}
