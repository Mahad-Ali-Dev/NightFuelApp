/**
 * Jest stub for `react-native-ble-plx`.
 *
 * src/lib/ble/bleManager.ts lazily `require('react-native-ble-plx')` and does
 * `new lib.BleManager()` inside a try/catch. Under jest there is no native BLE
 * module, so the stub's constructor THROWS — the manager's catch sets the native
 * manager to null, `isSupported()` returns false, and every BLE method degrades
 * to the honest no-op (the same behaviour as Expo Go). Keeps the gate green
 * without a real native module.
 */
class BleManager {
  constructor() {
    throw new Error('BLE native module unavailable (jest stub)');
  }
}

module.exports = { BleManager };
