const path = require('node:path');
const { getDefaultConfig: getRNDefaultConfig, mergeConfig } = require('@react-native/metro-config');
// NativeWind 5 / react-native-css requires a bundler-level CSS asset pipeline that, as of
// this writing, only Expo's metro config provides. Per react-native-css's README, non-Expo
// (bare RN) apps should install `@expo/metro-config` purely for its `getDefaultConfig` and
// use that instead of `@react-native/metro-config`'s `getDefaultConfig`.
const { getDefaultConfig } = require('@expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * pnpm workspace note: pnpm's node_modules are symlinks into a central content-addressed
 * store, which Metro doesn't follow by default. `unstable_enableSymlinks` plus watching the
 * monorepo root (so Metro's file watcher can see packages like @easy-auth/auth-client that
 * live outside this app's directory) is the standard, documented fix.
 * See: https://metrobundler.dev/docs/configuration/#unstable_enablesymlinks-experimental
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = {
  watchFolders: [monorepoRoot],
  resolver: {
    unstable_enableSymlinks: true,
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
  },
};

// NativeWind's `withNativeWind` spreads the config it's given and only adds/overrides
// `transformerPath`/`transformer.*` (plus a resolver.resolveRequest wrapper for its virtual
// CSS module). It does not touch `resolver.unstable_enableSymlinks`, `resolver.nodeModulesPaths`,
// or `watchFolders` — so it must WRAP the already-merged pnpm-aware config below, not be merged
// as a sibling/replacement of it, or the symlink fix would be silently lost.
//
// NativeWind 5 no longer takes an `input` option here — the global CSS file is loaded via a
// plain `import './global.css'` in the app's entry point instead (see App.tsx).
const expoConfig = mergeConfig(getDefaultConfig(projectRoot), config);

// `@expo/metro-config`'s getDefaultConfig only points `transformer.asyncRequireModulePath` at
// `expo/internal/async-require-module` when the `expo` package is resolvable — but it still
// leaves it unset/broken for a bare RN app in some resolution orders, causing "Unable to
// resolve module expo/internal/async-require-module". Force it back to React Native's own
// async-require shim (resolved via @react-native/metro-config, which can find it relative to
// its own install location) since this is a non-Expo app.
expoConfig.transformer.asyncRequireModulePath =
  getRNDefaultConfig(projectRoot).transformer.asyncRequireModulePath;

module.exports = withNativeWind(expoConfig);
