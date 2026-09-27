/**
 * Sentry 11 replaced the single `sendDefaultPii: false` flag with a
 * `dataCollection` object, and every field in it defaults to **collecting**.
 * Dropping the removed flag without writing this would have inverted the
 * policy: stack-frame locals, bound query parameters and returned rows,
 * cookies, headers and bodies all start flowing to Sentry.
 *
 * This is a ledger. A local variable is an amount, a query parameter is an
 * account id, a request body is a transaction. None of it belongs in an error
 * report, so every channel is off — including the ones for integrations this
 * app does not currently load (GraphQL, gen-AI), so that adding one later is
 * not silently also a decision to start sending its payloads.
 *
 * `frameContextLines` is deliberately left at its default: it captures lines of
 * *our own source* around a frame, which is what makes a stack trace readable
 * and carries no user data.
 *
 * Shared by the three runtime configs rather than copied into each, because a
 * copy is how one of them ends up a field behind after an upgrade.
 *
 * Kept free of imports so the client bootstrap can use it too — see the env
 * exception for these files in CLAUDE.md.
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  // Not `as const`: httpBodies has to stay a mutable array to satisfy the
  // DataCollection type.
}

/**
 * Sentry 11 added `consoleIntegration` to the default integrations; Sentry 10
 * did not. It turns every console call into a breadcrumb attached to the next
 * error, verbatim — which is the exact channel CLAUDE.md rules out, because a
 * React hydration-mismatch message quotes the rendered text, and here the
 * rendered text is account names and amounts. Verified against production: a
 * console line survived into the envelope until this filter existed.
 *
 * Note this is NOT `consoleLoggingIntegration` (console → Sentry Logs), which
 * this app has never enabled. Two different features, both off.
 */
export const withoutConsoleBreadcrumbs = <T extends { name: string }>(defaults: T[]): T[] => defaults.filter(i => i.name !== 'Console')
