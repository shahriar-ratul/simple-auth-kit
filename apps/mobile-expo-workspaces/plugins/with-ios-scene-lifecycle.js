// iOS 27 terminates apps at launch unless they adopt the UIScene life cycle. Expo SDK 57's runtime
// already ships the pieces (ExpoAppSceneDelegate, ExpoReactNativeFactoryProvider), but its prebuild
// template still generates the old window-in-AppDelegate shape; the SDK 58 template is the first
// to use them. This plugin makes `expo prebuild` emit that SDK 58 shape on SDK 57.
//
// Delete this plugin (and its app.json entry) once the app is on SDK 58: the template does it then.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
      },
    ],
  },
};

// The SDK 57 AppDelegate creates the window and starts React Native itself; under the scene life
// cycle ExpoAppSceneDelegate does both, using the factory this AppDelegate provides.
const WINDOW_STARTUP =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n[\s\S]*?#endif\n/;

function adoptSceneLifecycle(contents) {
  if (contents.includes('ExpoAppSceneDelegate')) return contents; // already applied
  const declaration = 'class AppDelegate: ExpoAppDelegate {';
  if (!contents.includes(declaration) || !WINDOW_STARTUP.test(contents)) {
    throw new Error(
      'with-ios-scene-lifecycle: AppDelegate.swift no longer matches the SDK 57 template this ' +
        'plugin rewrites. If the app is on SDK 58+, remove the plugin from app.json.',
    );
  }
  return (
    contents
      .replace(
        declaration,
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      )
      .replace(
        WINDOW_STARTUP,
        '\n    // The window is created and React Native is started by `SceneDelegate` under the\n' +
          '    // scene-based life cycle (required by the iOS 27 SDK).\n',
      ) +
    '\n@objc(SceneDelegate)\nclass SceneDelegate: ExpoAppSceneDelegate {}\n'
  );
}

module.exports = function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, cfg => {
    cfg.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return cfg;
  });
  return withAppDelegate(config, cfg => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error(
        'with-ios-scene-lifecycle: expected a Swift AppDelegate.',
      );
    }
    cfg.modResults.contents = adoptSceneLifecycle(cfg.modResults.contents);
    return cfg;
  });
};
