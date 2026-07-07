/**
 * bleManager.test.ts — the direct-BLE seam under the gate.
 *
 * react-native-ble-plx is mapped to a stub whose `new BleManager()` THROWS (no
 * native module, as in Expo Go / CI). The manager must therefore report
 * unsupported and degrade EVERY action to an honest no-op that never throws.
 * AsyncStorage is mocked since the manager imports it for device persistence.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));

import { bleManager } from '@/lib/ble/bleManager';

describe('bleManager (no native module / gate)', () => {
  it('reports unsupported when the native BLE module is absent', () => {
    expect(bleManager.isSupported()).toBe(false);
  });

  it('every action degrades to an honest no-op and NEVER throws', async () => {
    const found: unknown[] = [];
    await expect(bleManager.startScan((d) => found.push(d))).resolves.toBeUndefined();
    expect(found).toHaveLength(0);

    await expect(bleManager.connect('device-id', 'My Watch')).resolves.toBe(false);
    await expect(bleManager.disconnect()).resolves.toBeUndefined();

    // The row getters stay in the closed status vocabulary.
    expect(['connected', 'unavailable', 'disconnected']).toContain(bleManager.getStatusForRow());
    expect(bleManager.lastReadingAt()).toBeNull();
  });
});
