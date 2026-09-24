import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// End-to-end tests: these boot the real app and talk to a real database, so they are kept out of
// `npm test` (see ../vitest.config.mts) and run via `npm run test:e2e`.
//
// `.mts` (not `.ts`): this package is CommonJS, and Vite's native config loader requires an
// explicit ESM extension to load a config written with `import` syntax.
//
// `root` is resolved from this file rather than from process.cwd() so the suite behaves the same
// whichever directory it is invoked from. Aliases mirror tsconfig.json's `paths`; the more
// specific prefixes come first because matching is by prefix, in order.
const projectRoot = resolve(import.meta.dirname, '..');

export default defineConfig({
  resolve: {
    alias: {
      '@/core': resolve(projectRoot, 'src/core'),
      '@/database': resolve(projectRoot, 'database'),
      '@': resolve(projectRoot, 'src'),
    },
  },
  test: {
    root: projectRoot,
    environment: 'node',
    include: ['test/e2e/**/*.e2e-spec.ts'],
    testTimeout: 30000,
  },
});
