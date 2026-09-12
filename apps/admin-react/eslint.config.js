import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // src/components/ui/** is shadcn-generated (components.json), not hand-authored — same
    // "vendored, don't lint" treatment this repo already gives it for Biome (the surviving
    // biome-ignore-all comment on multi-selector.tsx).
    ignores: ["dist/**", "node_modules/**", "src/components/ui/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // TanStack Table's useReactTable() is on React Compiler's own documented list of
      // incompatible APIs (it returns functions that can't be safely memoized) — the compiler
      // already handles this correctly by skipping memoization for it; there's no code change
      // that "fixes" a structural library incompatibility.
      "react-hooks/incompatible-library": "off",
    },
  },
);
