/**
 * Tests for the default no-op health-sync adapter in src/lib/healthSync.ts and
 * the type-seam constants in src/lib/healthSync.types.ts.
 *
 * These pin the contract the real HealthKit / Google-Fit / BLE adapters will
 * later have to honour, and the honest-fallback behaviour the Expo-Go default
 * must exhibit today:
 *
 *   1. the default adapter implements EVERY HealthSyncAdapter method;
 *   2. connect() / syncNow() RESOLVE (never throw) to status 'unavailable'
 *      with a human-readable reason containing "requires a native dev build";
 *   3. before any sync, getStatus() === 'unavailable' and lastSyncedAt() === null;
 *   4. all data-kinds ('steps'|'heartRate'|'sleep'|'workouts') and all sources
 *      ('apple_health'|'google_fit'|'generic_ble') enumerate as documented.
 *
 * The module is pure TypeScript (no react-native / expo / native imports, no
 * network, no Date.now branching), so the suite needs NO mocks.
 */
import defaultHealthSync, {
  NOOP_UNAVAILABLE_REASON,
  SUPPORTED_HEALTH_DATA_KINDS,
  SUPPORTED_HEALTH_SOURCES,
  getHealthSyncAdapter,
  noopHealthSyncAdapter,
} from '@/lib/healthSync';
import {
  HEALTH_DATA_KINDS,
  HEALTH_SOURCES,
  HEALTH_SYNC_STATUSES,
  type HealthSyncAdapter,
} from '@/lib/healthSync.types';

// The phrase the acceptance criterion fixes the reason string to. Matched
// case-insensitively so the human-readable copy can be reworded around it.
const REQUIRED_REASON_FRAGMENT = 'requires a native dev build';

describe('healthSync — default no-op adapter', () => {
  const adapter = getHealthSyncAdapter();

  test('getHealthSyncAdapter() returns the no-op adapter (the default export too)', () => {
    expect(adapter).toBe(noopHealthSyncAdapter);
    expect(defaultHealthSync).toBe(noopHealthSyncAdapter);
  });

  // (1) implements every HealthSyncAdapter method.
  test('implements every HealthSyncAdapter method', () => {
    const methods: (keyof HealthSyncAdapter)[] = [
      'connect',
      'disconnect',
      'getStatus',
      'syncNow',
      'lastSyncedAt',
    ];
    for (const m of methods) {
      expect(typeof adapter[m]).toBe('function');
    }
    // No extra/renamed surface: exactly the five contract methods exist.
    const record = adapter as unknown as Record<string, unknown>;
    const ownMethods = Object.keys(record).filter(
      (k) => typeof record[k] === 'function',
    );
    expect(ownMethods.sort()).toEqual([...methods].sort());
  });

  // (3) ground truth BEFORE any sync.
  describe('ground truth before any sync', () => {
    test("getStatus() === 'unavailable'", () => {
      expect(adapter.getStatus()).toBe('unavailable');
    });

    test('lastSyncedAt() === null', () => {
      expect(adapter.lastSyncedAt()).toBeNull();
    });
  });

  // (2) connect() / syncNow(): resolve, never throw, honest 'unavailable' reason.
  describe.each([
    ['connect', () => adapter.connect()],
    ['syncNow', () => adapter.syncNow()],
  ] as const)('%s()', (_name, call) => {
    test("resolves to status 'unavailable' (never rejects/throws)", async () => {
      await expect(call()).resolves.toEqual(
        expect.objectContaining({ status: 'unavailable' }),
      );
    });

    test('reason is a human-readable string containing the required phrase', async () => {
      const result = await call();
      expect(typeof result.reason).toBe('string');
      expect(result.reason).toBeTruthy();
      expect(result.reason?.toLowerCase()).toContain(REQUIRED_REASON_FRAGMENT);
    });

    test('reason matches the documented NOOP_UNAVAILABLE_REASON constant', async () => {
      const result = await call();
      expect(result.reason).toBe(NOOP_UNAVAILABLE_REASON);
    });
  });

  test("the documented reason constant itself contains 'requires a native dev build'", () => {
    expect(NOOP_UNAVAILABLE_REASON.toLowerCase()).toContain(
      REQUIRED_REASON_FRAGMENT,
    );
  });

  test('disconnect() resolves to void (never throws), and is idempotent', async () => {
    await expect(adapter.disconnect()).resolves.toBeUndefined();
    // Calling it again must also be a safe no-op.
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });

  test('status is still ground-truth unavailable after connect + sync (no-op never connects)', async () => {
    await adapter.connect();
    await adapter.syncNow();
    expect(adapter.getStatus()).toBe('unavailable');
    expect(adapter.lastSyncedAt()).toBeNull();
  });

  test('the singleton is frozen — callers cannot mutate the shared instance', () => {
    expect(Object.isFrozen(noopHealthSyncAdapter)).toBe(true);
  });
});

describe('healthSync.types — documented enumerations', () => {
  // (4) all data-kinds enumerate as documented.
  test("HEALTH_DATA_KINDS is exactly ['steps','heartRate','sleep','workouts']", () => {
    expect([...HEALTH_DATA_KINDS]).toEqual([
      'steps',
      'heartRate',
      'sleep',
      'workouts',
    ]);
  });

  // (4) all sources enumerate as documented.
  test("HEALTH_SOURCES is exactly ['apple_health','google_fit','generic_ble']", () => {
    expect([...HEALTH_SOURCES]).toEqual([
      'apple_health',
      'google_fit',
      'generic_ble',
    ]);
  });

  test("HEALTH_SYNC_STATUSES is exactly ['connected','unavailable','disconnected']", () => {
    expect([...HEALTH_SYNC_STATUSES]).toEqual([
      'connected',
      'unavailable',
      'disconnected',
    ]);
  });

  test('healthSync re-exports the same source + data-kind lists for the UI', () => {
    expect([...SUPPORTED_HEALTH_SOURCES]).toEqual([...HEALTH_SOURCES]);
    expect([...SUPPORTED_HEALTH_DATA_KINDS]).toEqual([...HEALTH_DATA_KINDS]);
  });

  test("'unavailable' is a valid status the adapter can actually report", () => {
    expect(HEALTH_SYNC_STATUSES).toContain(getHealthSyncAdapter().getStatus());
  });
});
