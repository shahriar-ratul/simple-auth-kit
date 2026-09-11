// react-native-config reads its native module's getConfig() result at import time; there is no
// native module under jest, so importing the real package throws before any test can run.
module.exports = {};
