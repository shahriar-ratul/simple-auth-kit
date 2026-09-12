import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    // src/components/ui/** is shadcn-generated (components.json), not hand-authored — same
    // "vendored, don't lint" treatment this repo already gives it for Biome (the surviving
    // biome-ignore-all comment on multi-selector.tsx).
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "dist/**",
      "src/components/ui/**",
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      // TanStack Table's useReactTable() is on React Compiler's own documented list of
      // incompatible APIs (it returns functions that can't be safely memoized) — the compiler
      // already handles this correctly by skipping memoization for it; there's no code change
      // that "fixes" a structural library incompatibility.
      "react-hooks/incompatible-library": "off",
    },
  },
];

export default config;
