/**
 * health-native.d.ts
 *
 * Ambient module shims for the on-device health packages used ONLY by the lazy
 * native adapter (`src/lib/healthSyncNative.ts`):
 *
 *   - `@kingstinct/react-native-healthkit`  → Apple HealthKit (iOS), READ-ONLY.
 *   - `react-native-health-connect`         → Android Health Connect, READ-ONLY.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * These packages are DECLARED in package.json for the EAS build but are NOT
 * installed in the environment that runs the jest/`tsc` gate (we do not
 * `npm install` native deps there). Without a type for them, `tsc --noEmit`
 * would error on healthSyncNative.ts's imports ("Cannot find module …"). These
 * minimal `declare module` shims give the type-checker just enough surface for
 * that file to compile WITHOUT the packages present. They mirror the F30
 * `src/types/voice-native.d.ts` precedent.
 *
 * REMOVE-ME ONCE DEPS ARE INSTALLED
 * ---------------------------------
 * When the packages are actually installed (for an EAS dev/release build), DELETE
 * the corresponding `declare module` block(s) so the real, complete bundled types
 * take over. Keeping a shim for an installed package would shadow its real types.
 * These shims are intentionally a SUBSET of the real APIs — only what the native
 * adapter uses.
 */

// ─── @kingstinct/react-native-healthkit (iOS) ─────────────────────────────────
declare module '@kingstinct/react-native-healthkit' {
  export enum HKQuantityTypeIdentifier {
    stepCount = 'HKQuantityTypeIdentifierStepCount',
    heartRate = 'HKQuantityTypeIdentifierHeartRate',
    restingHeartRate = 'HKQuantityTypeIdentifierRestingHeartRate',
    heartRateVariabilitySDNN = 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    activeEnergyBurned = 'HKQuantityTypeIdentifierActiveEnergyBurned',
  }

  export enum HKCategoryTypeIdentifier {
    sleepAnalysis = 'HKCategoryTypeIdentifierSleepAnalysis',
  }

  export interface HKQuantitySample {
    startDate: string | number | Date;
    endDate?: string | number | Date;
    quantity: number;
    unit?: string;
  }

  export interface HKCategorySample {
    startDate: string | number | Date;
    endDate?: string | number | Date;
    value: number;
  }

  export interface HKQueryOptions {
    from?: string;
    to?: string;
    [key: string]: unknown;
  }

  const HealthKit: {
    isHealthDataAvailable(): Promise<boolean>;
    requestAuthorization(
      read: Array<HKQuantityTypeIdentifier | HKCategoryTypeIdentifier>,
      write?: Array<HKQuantityTypeIdentifier | HKCategoryTypeIdentifier>,
    ): Promise<boolean>;
    queryQuantitySamples(
      identifier: HKQuantityTypeIdentifier,
      options?: HKQueryOptions,
    ): Promise<HKQuantitySample[]>;
    queryCategorySamples(
      identifier: HKCategoryTypeIdentifier,
      options?: HKQueryOptions,
    ): Promise<HKCategorySample[]>;
  };

  export default HealthKit;
}

// ─── react-native-health-connect (Android) ────────────────────────────────────
declare module 'react-native-health-connect' {
  export enum SdkAvailabilityStatus {
    SDK_UNAVAILABLE = 1,
    SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED = 2,
    SDK_AVAILABLE = 3,
  }

  export interface HealthConnectPermission {
    accessType: 'read' | 'write';
    recordType: string;
  }

  export interface TimeRangeFilter {
    operator: 'between' | 'after' | 'before';
    startTime?: string;
    endTime?: string;
  }

  export interface ReadRecordsOptions {
    timeRangeFilter: TimeRangeFilter;
    [key: string]: unknown;
  }

  export interface ReadRecordsResult {
    records: any[];
  }

  export function initialize(): Promise<boolean>;
  export function getSdkStatus(): Promise<SdkAvailabilityStatus>;
  export function requestPermission(
    permissions: HealthConnectPermission[],
  ): Promise<HealthConnectPermission[]>;
  export function readRecords(
    recordType: string,
    options: ReadRecordsOptions,
  ): Promise<ReadRecordsResult>;
}
