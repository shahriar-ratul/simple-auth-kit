const path = require('node:path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * pnpm workspace note: pnpm's node_modules are symlinks into a central content-addressed
 * store, which Metro doesn't follow by default. `unstable_enableSymlinks` plus watching the
 * monorepo root (so Metro's file watcher can see packages like @simple-auth-kit/auth-client that
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

// NativeWind 4 works on React Native's own metro config — no Expo tooling in this app. Its
// `withNativeWind` only adds transformer/resolver hooks for the CSS entry point, so it WRAPS the
// already-merged pnpm-aware config rather than replacing it (which would drop the symlink fix).
module.exports = withNativeWind(
  mergeConfig(getDefaultConfig(projectRoot), config),
  {
    input: './global.css',
  },
);
