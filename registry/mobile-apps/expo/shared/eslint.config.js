const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  {
    ignores: ['dist/**', 'node_modules/**', '.expo/**', 'ios/**', 'android/**'],
  },
  expoConfig,
]);
