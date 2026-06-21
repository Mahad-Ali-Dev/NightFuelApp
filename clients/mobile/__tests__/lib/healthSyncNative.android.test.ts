/**
 * healthSyncNative.android.test.ts
 *
 * Focused coverage for the Android (Health Connect) branch of the REAL native
 * health-sync adapter — `src/lib/healthSyncNative.ts` — and specifically the
 * honest-permission contract on `connect()`:
 *
 *   Health Connect's `requestPermission()` RESOLVES with the set of permissions
 *   the user actually GRANTED (possibly empty if they declined every toggle); it
 *   does NOT throw on a denial. The adapter must therefore inspect that set and
 *   only report 'connected' when at least one READ permission came back — when
 *   none did, it must degrade to a non-'connected', honest status with a reason
 *   (LOW #5). Claiming 'connected' after a full denial would let a later sync
 *   silently read nothing while the UI shows a healthy connection.
 *
 * Unlike __tests__/lib/healthSync.test.ts (which exercises the no-op fallback via
 * the jest moduleNameMapper stub that reports Health Connect UNAVAILABLE), this
 * suite jest.mock()s `react-native-health-connect` with a CONTROLLABLE fake that
 * looks present + available, and forces Platform.OS = 'android', so we can drive
 * `buildAndroidAdapter().connect()` down each granted/denied path. No native
 * package is installed — the mock is hermetic.
 */

// Controllable Health Connect fake. `initialize` MUST be a function so
// healthSyncNative's `typeof hcInitialize === 'function'` availability probe
// passes (the shipped moduleNameMapper stub deliberately makes it null to force
// the no-op; here we want the real Android branch). The granted set returned by
// requestPermission is swappable per-test via `mockHc.granted`.
const mockHc: {
  granted: Array<{ accessType: 'read' | 'write'; recordType: string }>;
  sdkStatus: number;
} = { granted: [], sdkStatus: 3 /* SDK_AVAILABLE */ };

// `mock`-prefixed so jest's hoist guard allows referencing it in the factory.
const mockRequestPermission = jest.fn(
  (..._args: any[]) => Promise.resolve(mockHc.granted),
);

jest.mock('react-native-health-connect', () => ({
  SdkAvailabilityStatus: {
    SDK_UNAVAILABLE: 1,
    SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2,
    SDK_AVAILABLE: 3,
  },
  initialize: jest.fn(() => Promise.resolve(true)),
  getSdkStatus: jest.fn(() => Promise.resolve(mockHc.sdkStatus)),
  requestPermission: (...args: any[]) => mockRequestPermission(...args),
  readRecords: jest.fn(() => Promise.resolve({ records: [] })),
}));

// HealthKit is never used on the Android branch, but the module imports it at the
// top, so keep a harmless stub mapping in place (the moduleNameMapper already
// points it at a stub — no extra mock needed here).

describe('healthSyncNative — Android connect() permission honesty (LOW #5)', () => {
  beforeEach(() => {
    mockRequestPermission.mockClear();
    mockHc.granted = [];
    mockHc.sdkStatus = 3;
    jest.resetModules();
  });

  /**
   * Fresh module instance per call so the module-level `connected` flag doesn't
   * leak across tests. We force Platform.OS='android' on the FRESHLY-required
   * react-native (resetModules gives a new instance each time) BEFORE requiring
   * the adapter, so buildAndroidAdapter() is the branch taken.
   */
  const loadAdapter = () => {
    let adapter: any;
    jest.isolateModules(() => {
      const RN = require('react-native');
      Object.defineProperty(RN.Platform, 'OS', { get: () => 'android', configurable: true });
      const mod = require('@/lib/healthSyncNative');
      adapter = mod.createNativeHealthSyncAdapter();
    });
    return adapter;
  };

  test('builds an Android adapter when Health Connect looks present', () => {
    const adapter = loadAdapter();
    expect(adapter).not.toBeNull();
    expect(typeof adapter.connect).toBe('function');
  });

  test("returns 'connected' when at least one READ permission is granted", async () => {
    mockHc.granted = [
      { accessType: 'read', recordType: 'SleepSession' },
      { accessType: 'read', recordType: 'Steps' },
    ];
    const adapter = loadAdapter();
    const result = await adapter.connect();
    expect(result.status).toBe('connected');
    expect(adapter.getStatus()).toBe('connected');
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  test("does NOT report 'connected' when NO permission is granted (empty set)", async () => {
    mockHc.granted = []; // user declined every toggle
    const adapter = loadAdapter();
    const result = await adapter.connect();
    expect(result.status).not.toBe('connected');
    expect(result.status).toBe('disconnected');
    expect(typeof result.reason).toBe('string');
    expect(result.reason).toBeTruthy();
    // Ground truth must agree — getStatus() stays non-connected.
    expect(adapter.getStatus()).not.toBe('connected');
  });

  test("does NOT report 'connected' when only WRITE perms come back (no reads)", async () => {
    // Defensive: even if the platform handed back a non-read grant, with zero
    // READ access we cannot actually read data → not connected.
    mockHc.granted = [{ accessType: 'write', recordType: 'Steps' }];
    const adapter = loadAdapter();
    const result = await adapter.connect();
    expect(result.status).not.toBe('connected');
  });

  test('resolves (never throws) even when requestPermission rejects', async () => {
    mockRequestPermission.mockImplementationOnce(() => Promise.reject(new Error('boom')));
    const adapter = loadAdapter();
    await expect(adapter.connect()).resolves.toEqual(
      expect.objectContaining({ status: expect.any(String) }),
    );
  });
});
