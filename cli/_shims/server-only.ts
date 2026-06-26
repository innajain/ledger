// No-op stand-in for the `server-only` package. The real one resolves only
// through Next's bundler alias and throws under plain Node, which would break
// importing any infra module (prisma/env/redis/links/...) from the CLI. The
// CLI tsconfig (`cli/tsconfig.json`) maps `server-only` here so those imports
// become harmless. This file is never imported by the Next build.
export {}
