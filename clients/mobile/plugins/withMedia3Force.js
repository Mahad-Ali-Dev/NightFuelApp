/**
 * withMedia3Force — Expo config plugin.
 *
 * expo-video (3.0.16) declares androidx.media3 1.8.0, but a stale TRANSITIVE
 * media3 was winning gradle resolution for some modules, so at runtime
 * `LoadControl.getAllocator(PlayerId)` (added in 1.8.x) was missing on the
 * loaded LoadControl → `java.lang.AbstractMethodError` → the app crashed the
 * moment an exercise-detail demo video started playing.
 *
 * This forces EVERY androidx.media3:* artifact to a single version (1.8.0, the
 * one expo-video is built against) via a gradle resolutionStrategy in the
 * project build.gradle, so the split can't happen.
 */
const { withProjectBuildGradle } = require('expo/config-plugins');

const MEDIA3_VERSION = '1.8.0';
const MARKER = 'zeitra-media3-force';
const BLOCK = `
// ${MARKER}: pin one androidx.media3 version (expo-video needs ${MEDIA3_VERSION}). A stale
// transitive media3 caused a runtime AbstractMethodError on LoadControl.getAllocator(PlayerId).
allprojects {
  configurations.all {
    resolutionStrategy.eachDependency { details ->
      if (details.requested.group == 'androidx.media3') {
        details.useVersion '${MEDIA3_VERSION}'
      }
    }
  }
}
`;

module.exports = function withMedia3Force(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withMedia3Force: expected a groovy build.gradle');
    }
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += BLOCK;
    }
    return cfg;
  });
};
