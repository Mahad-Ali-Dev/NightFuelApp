/**
 * Jest stub for `@kingstinct/react-native-healthkit` (iOS HealthKit).
 *
 * Same rationale as the F30 voice stubs: the package is declared in package.json
 * for the EAS build but NOT installed for the gate, and jest eagerly resolves the
 * lazy `require('./healthSyncNative')` in `src/lib/healthSync.ts`. This stub keeps
 * that resolvable WITHOUT the native package, so the gate stays green with no
 * `npm install`.
 *
 * It mirrors the real Expo-Go / gate condition: under jest the default Platform.OS
 * is 'ios', so to keep getHealthSyncAdapter() honest the probe must report the
 * module as NOT really present. `isHealthDataAvailable` is intentionally NOT a
 * function, so healthSyncNative's `typeof HealthKit.isHealthDataAvailable ===
 * 'function'` probe yields FALSE → buildIosAdapter() returns null →
 * createNativeHealthSyncAdapter() returns null → getHealthSyncAdapter() falls
 * back to the honest no-op.
 */
const HKQuantityTypeIdentifier = {
  stepCount: 'stepCount',
  heartRate: 'heartRate',
  restingHeartRate: 'restingHeartRate',
  heartRateVariabilitySDNN: 'heartRateVariabilitySDNN',
  activeEnergyBurned: 'activeEnergyBurned',
};

const HKCategoryTypeIdentifier = {
  sleepAnalysis: 'sleepAnalysis',
};

module.exports = {
  HKQuantityTypeIdentifier,
  HKCategoryTypeIdentifier,
  // Default export: the HealthKit object. `isHealthDataAvailable` is NOT a
  // function on purpose — signals "no native HealthKit module" to the probe.
  default: {
    isHealthDataAvailable: null,
    requestAuthorization: () => Promise.resolve(false),
    queryQuantitySamples: () => Promise.resolve([]),
    queryCategorySamples: () => Promise.resolve([]),
  },
};
