// Custom app entry point.
//
// Why this file exists (instead of the default `expo-router/entry` in package.json
// `main`): the Android home-screen widget needs its task handler registered in the
// SAME JS bundle the app runs from, so that Android can render the widget headless
// (when the app isn't foregrounded). `expo-router/entry` registers the root React
// component; we import it for that side effect, then register the widget handler.
//
// Order matters: importing `expo-router/entry` first sets up the app exactly as the
// default entry would, so normal launches are unaffected.
import 'expo-router/entry';

import { Platform } from 'react-native';

// The widget is Android-only. Guarding here means iOS / web never load the native
// module or any widget code — a missing-native-module no-op risk avoided entirely.
if (Platform.OS === 'android') {
    // Lazy require (not a top-level import) so the widget module tree is only
    // evaluated on Android.
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./src/widgets/widgetTaskHandler');
    registerWidgetTaskHandler(widgetTaskHandler);
}
