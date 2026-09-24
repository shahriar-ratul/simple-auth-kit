import { defineConfig } from 'vitest/config';

// Anchors vitest here: without a config of its own it walks up the directory tree and would pick
// up any parent project's vitest config instead. Tests import app modules that never touch the
// react-native runtime (native modules are vi.mock()ed), so plain Node is the environment.
export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
  },
});
