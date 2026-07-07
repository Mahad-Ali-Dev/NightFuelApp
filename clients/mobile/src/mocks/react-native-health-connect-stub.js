/**
 * Jest stub for `react-native-health-connect` (Android Health Connect).
 *
 * Same rationale as the HealthKit stub: the package is declared for the EAS build
 * but NOT installed for the gate, and jest eagerly resolves the lazy
 * `require('./healthSyncNative')`. This stub keeps that resolvable WITHOUT the
 * native package, so the gate stays green with no `npm install`.
 *
 * Under jest the default Platform.OS is 'ios', so the Android branch isn't even
 * taken; but to be robust (and to mirror the gate condition if a suite forces
 * Platform.OS='android'), `initialize` is intentionally NOT a function so
 * healthSyncNative's `typeof hcInitialize === 'function'` probe yields FALSE →
 * buildAndroidAdapter() returns null → the honest no-op.
 */
module.exports = {
  SdkAvailabilityStatus: {
    SDK_UNAVAILABLE: 1,
    SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2,
    SDK_AVAILABLE: 3,
  },
  // NOT a function — signals "no native Health Connect module" to the probe.
  initialize: null,
  getSdkStatus: () => Promise.resolve(1),
  requestPermission: () => Promise.resolve([]),
  readRecords: () => Promise.resolve({ records: [] }),
};
