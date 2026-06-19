// Local Expo config plugin: select react-native-iap's "play" store flavor.
//
// react-native-iap ships Android product flavors (play / amazon) under the
// "store" dimension, so the consuming app must declare a
// `missingDimensionStrategy`. We do ONLY that here instead of using
// react-native-iap's own config plugin, because that plugin ALSO injects
// `supportLibVersion = "28.0.0"` into the root build.gradle — a legacy
// support-library variable that does not exist on Expo SDK 54 (AndroidX),
// which fails with: "Could not set unknown property 'supportLibVersion'".
const { withAppBuildGradle } = require('expo/config-plugins');

const STRATEGY = 'missingDimensionStrategy "store", "play"';

module.exports = function withIapPlayFlavor(config) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes(STRATEGY)) {
      // Insert as the first line inside the app module's defaultConfig { } block.
      contents = contents.replace(/(defaultConfig\s*\{)/, `$1\n        ${STRATEGY}`);
      cfg.modResults.contents = contents;
    }
    return cfg;
  });
};
