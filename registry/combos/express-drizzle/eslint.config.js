import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".variant/**", "node_modules/**", "dist/**", "generated/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // This combo's leading-underscore convention (e.g. an interface-required parameter that's
      // deliberately unused) predates this eslint config — respect it rather than flag it.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
