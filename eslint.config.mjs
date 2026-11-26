import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Native alert/confirm/prompt can be suppressed by the host (embedded browsers,
      // "prevent additional dialogs") and then return at once — a confirm() reads as
      // Cancel and the action silently never runs. Use useConfirm() / useToast().
      'no-alert': 'error',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Git worktrees checked out inside the repo (see .git/info/exclude).
    'worktrees/**',
    '.claude/**',
    'generated/**',
  ]),
])

export default eslintConfig
