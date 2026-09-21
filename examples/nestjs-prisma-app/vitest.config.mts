import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests. The e2e suite has its own config (test/vitest-e2e.config.mts) because it needs a
// database and a much longer timeout — keeping them apart means `npm test` stays fast and
// dependency-free while `npm run test:e2e` is the one that needs Postgres up.
//
// `.mts` (not `.ts`): this package is CommonJS, and Vite's native config loader requires an
// explicit ESM extension to load a config written with `import` syntax.
//
// The aliases mirror tsconfig.json's `paths` exactly; Vitest does not read those itself, and the
// more specific prefixes must come first since matching is by prefix, in order.
const projectRoot = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@/core": resolve(projectRoot, "src/core"),
      "@/database": resolve(projectRoot, "database"),
      "@": resolve(projectRoot, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
