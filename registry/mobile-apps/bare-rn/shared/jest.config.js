module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['react-native-gesture-handler/jestSetup'],
  // pnpm nests every package under node_modules/.pnpm/<name>@<version>/node_modules/<name>, so
  // the preset's own transformIgnorePatterns (which only looks past the *first* "node_modules/")
  // never reaches the react-native packages it means to un-ignore — whitelisting ".pnpm" lets the
  // pattern search past that wrapper segment to the real package name.
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm|(jest-)?react-native|@react-native(-[\\w-]+)?|@react-navigation|react-native-[\\w-]+|nativewind|@simple-auth-kit)/)',
  ],
  // nativewind's global.css import has no meaning outside Metro's bundler — jest has nothing
  // that transforms raw CSS, so stub it to an empty module rather than let it hit the parser.
  moduleNameMapper: {
    '\\.css$': '<rootDir>/__mocks__/styleMock.js',
    '^react-native-config$': '<rootDir>/__mocks__/reactNativeConfigMock.js',
  },
};
