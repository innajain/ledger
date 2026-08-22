import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['**/*.test.ts'],
    // worktrees/ and .claude/ hold git worktrees with their own node_modules;
    // without these the suite picks up thousands of dependency tests.
    exclude: ['**/node_modules/**', '.next/**', 'generated/**', 'worktrees/**', '.claude/**'],
  },
})
