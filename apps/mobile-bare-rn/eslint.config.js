const { defineConfig } = require('eslint/config');
const reactNativeConfig = require('@react-native/eslint-config/flat');

module.exports = defineConfig([
  {
    ignores: ['node_modules/**', 'ios/**', 'android/**', 'coverage/**'],
  },
  ...reactNativeConfig,
  {
    // This app is TypeScript-only, no Flow — and eslint-plugin-ft-flow (pulled in by
    // @react-native/eslint-config/flat for the .js override) calls the removed
    // context.getAllComments() API under ESLint 9.3x+, crashing the linter on every .js file.
    files: ['**/*.js'],
    rules: {
      'ft-flow/define-flow-type': 'off',
      'ft-flow/use-flow-type': 'off',
    },
  },
]);
