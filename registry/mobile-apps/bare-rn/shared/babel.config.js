module.exports = {
  presets: ['module:@react-native/babel-preset', 'nativewind/babel'],
  // react-native-worklets' plugin must run last, per its own setup docs
  // (react-native-reanimated v4 delegates its worklet transform to this package).
  plugins: ['react-native-worklets/plugin'],
};
