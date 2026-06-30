/**
 * bleManager.ts — direct Bluetooth Low Energy wearable sync.
 *
 * Connects DIRECTLY to a watch / band / chest-strap over BLE and reads the
 * STANDARD GATT profiles every spec-compliant device exposes:
 *   - Heart Rate Service  0x180D → Heart Rate Measurement 0x2A37 (live BPM)
 *   - Battery Service     0x180F → Battery Level           0x2A19 (0–100 %)
 * Live heart-rate samples are forwarded (throttled) into the app's health
 * pipeline via `ingestHealthSamples({ kind:'heartRate', source:'generic_ble' })`.
 *
 * Honest-fallback / seam discipline (mirrors src/lib/healthSyncNative.ts):
 *   - `react-native-ble-plx` is lazy-required behind try/catch. In Expo Go / the
 *     jest gate the native module is absent → `isSupported()` is false and every
 *     method degrades to a no-op. NOTHING here throws into the caller.
 *   - Full step / sleep HISTORY from proprietary watches is NOT a BLE standard;
 *     that stays on the Health Connect / Apple Health path. This module is the
 *     LIVE-sensor seam, deliberately scoped to the open profiles.
 *
 * The proprietary chip-family protocols (Da Fit / FitCloudPro / …) can be layered
 * in later behind this same manager without changing the screen contract.
 */
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BleManager as RnBleManager, Device, Subscription } from 'react-native-ble-plx';
import { ingestHealthSamples } from '../../api/health';

// ── Standard GATT identifiers ────────────────────────────────────────────────
const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT_CHAR = '00002a37-0000-1000-8000-00805f9b34fb';
const BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';
const BATTERY_LEVEL_CHAR = '00002a19-0000-1000-8000-00805f9b34fb';

const LAST_DEVICE_KEY = 'nf.ble.lastDevice';
/** Don't flood the ingest endpoint — persist at most one HR sample per window. */
const HR_INGEST_THROTTLE_MS = 30_000;
/** Stop an idle scan automatically so the radio isn't left running. */
const SCAN_TIMEOUT_MS = 12_000;

export type BleStatus = 'idle' | 'unsupported' | 'scanning' | 'connecting' | 'connected';

export interface BleScanResult {
  id: string;
  name: string;
  rssi: number | null;
}

export interface BleState {
  status: BleStatus;
  /** The connected (or last-known) device, else null. */
  device: { id: string; name: string } | null;
  /** Latest live heart rate in BPM, else null. */
  heartRate: number | null;
  /** Latest battery level 0–100, else null. */
  battery: number | null;
  /** ISO timestamp of the last live reading, else null. */
  lastReadingAt: string | null;
  /** Human-readable last error / reason, else null. Never thrown — always data. */
  error: string | null;
}

type Listener = (state: BleState) => void;

/** Decode a base64 characteristic value to bytes (Hermes ships global atob). */
function base64ToBytes(b64: string | null | undefined): Uint8Array {
  const decode = (globalThis as { atob?: (s: string) => string }).atob;
  if (!b64 || typeof decode !== 'function') return new Uint8Array(0);
  try {
    const bin = decode(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array(0);
  }
}

/**
 * Parse a Heart Rate Measurement (0x2A37) payload. Byte 0 is flags; bit 0 is the
 * value format (0 = uint8 BPM in byte 1, 1 = uint16 LE BPM in bytes 1–2).
 */
function parseHeartRate(bytes: Uint8Array): number | null {
  if (bytes.length < 2) return null;
  const flags = bytes[0] ?? 0;
  const is16 = (flags & 0x01) === 0x01;
  const bpm = is16 && bytes.length >= 3 ? (bytes[1] ?? 0) | ((bytes[2] ?? 0) << 8) : (bytes[1] ?? 0);
  return bpm > 0 && bpm < 300 ? bpm : null;
}

class BleWearableManager {
  private manager: RnBleManager | null = null;
  private loaded = false;
  private hrSub: Subscription | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private lastIngestAt = 0;
  private readonly listeners = new Set<Listener>();

  private state: BleState = {
    status: 'idle',
    device: null,
    heartRate: null,
    battery: null,
    lastReadingAt: null,
    error: null,
  };

  // ── seam: lazily resolve the native manager (absent in Expo Go / jest) ──────
  private getManager(): RnBleManager | null {
    if (this.loaded) return this.manager;
    this.loaded = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const lib = require('react-native-ble-plx') as typeof import('react-native-ble-plx');
      this.manager = new lib.BleManager();
    } catch {
      this.manager = null; // no native module → unsupported, honest no-op
    }
    return this.manager;
  }

  /** True only in a native build with the BLE module linked. */
  isSupported(): boolean {
    return this.getManager() !== null;
  }

  getState(): BleState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<BleState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  // ── permissions (Android 12+ split BT perms; <12 needs fine location) ───────
  async ensurePermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const api = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
      const perms: string[] =
        api >= 31
          ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
          : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      const res = await PermissionsAndroid.requestMultiple(perms as any);
      return perms.every((p) => res[p as keyof typeof res] === PermissionsAndroid.RESULTS.GRANTED);
    } catch {
      return false;
    }
  }

  // ── scan ────────────────────────────────────────────────────────────────────
  /** Start scanning. Calls onDevice for each unique peripheral found. */
  async startScan(onDevice: (d: BleScanResult) => void): Promise<void> {
    const mgr = this.getManager();
    if (!mgr) {
      this.set({ status: 'unsupported', error: 'Bluetooth needs a native build — unavailable in Expo Go.' });
      return;
    }
    const granted = await this.ensurePermissions();
    if (!granted) {
      this.set({ error: 'Bluetooth permission was denied.' });
      return;
    }
    this.set({ status: 'scanning', error: null });
    const seen = new Set<string>();
    try {
      // null serviceUUIDs → scan all; many cheap watches advertise no service.
      mgr.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
        if (err) {
          this.set({ status: 'idle', error: err.message ?? 'Scan failed.' });
          this.stopScan();
          return;
        }
        if (!device || seen.has(device.id)) return;
        const name = device.name ?? device.localName;
        if (!name) return; // skip unnamed beacons — not user-pickable
        seen.add(device.id);
        onDevice({ id: device.id, name, rssi: device.rssi ?? null });
      });
    } catch (e: any) {
      this.set({ status: 'idle', error: e?.message ?? 'Could not start scanning.' });
      return;
    }
    this.scanTimer = setTimeout(() => this.stopScan(), SCAN_TIMEOUT_MS);
  }

  stopScan(): void {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    const mgr = this.getManager();
    try {
      mgr?.stopDeviceScan();
    } catch {
      /* idempotent */
    }
    if (this.state.status === 'scanning') this.set({ status: this.state.device ? 'connected' : 'idle' });
  }

  // ── connect ──────────────────────────────────────────────────────────────────
  async connect(deviceId: string, name: string): Promise<boolean> {
    const mgr = this.getManager();
    if (!mgr) {
      this.set({ status: 'unsupported', error: 'Bluetooth needs a native build — unavailable in Expo Go.' });
      return false;
    }
    this.stopScan();
    this.set({ status: 'connecting', device: { id: deviceId, name }, error: null });
    try {
      const device = await mgr.connectToDevice(deviceId, { timeout: 12_000 });
      await device.discoverAllServicesAndCharacteristics();
      await this.persistDevice(deviceId, name);
      this.set({ status: 'connected', device: { id: deviceId, name }, error: null });
      this.watchDisconnect(device);
      await this.startHeartRate(device);
      await this.readBattery(device);
      return true;
    } catch (e: any) {
      this.set({ status: 'idle', error: e?.message ?? 'Could not connect to the device.' });
      return false;
    }
  }

  private watchDisconnect(device: Device): void {
    try {
      device.onDisconnected(() => {
        this.hrSub?.remove();
        this.hrSub = null;
        this.set({ status: 'idle', heartRate: null, error: 'Device disconnected.' });
      });
    } catch {
      /* non-fatal */
    }
  }

  // ── live heart rate (0x2A37 notifications) ───────────────────────────────────
  private async startHeartRate(device: Device): Promise<void> {
    try {
      this.hrSub?.remove();
      this.hrSub = device.monitorCharacteristicForService(HR_SERVICE, HR_MEASUREMENT_CHAR, (err, ch) => {
        if (err || !ch?.value) return;
        const bpm = parseHeartRate(base64ToBytes(ch.value));
        if (bpm == null) return;
        const now = new Date().toISOString();
        this.set({ heartRate: bpm, lastReadingAt: now });
        this.maybeIngestHr(bpm, now);
      });
    } catch {
      // Device exposes no standard HR service — connected, but no live HR.
      this.set({ error: 'Connected, but this device exposes no standard heart-rate service.' });
    }
  }

  private async readBattery(device: Device): Promise<void> {
    try {
      const ch = await device.readCharacteristicForService(BATTERY_SERVICE, BATTERY_LEVEL_CHAR);
      const bytes = base64ToBytes(ch?.value);
      if (bytes.length >= 1) this.set({ battery: bytes[0] });
    } catch {
      /* no standard battery service — fine */
    }
  }

  /** Throttled fire-and-forget HR ingest into the health pipeline. */
  private maybeIngestHr(bpm: number, iso: string): void {
    const t = Date.parse(iso);
    if (t - this.lastIngestAt < HR_INGEST_THROTTLE_MS) return;
    this.lastIngestAt = t;
    void ingestHealthSamples([
      { kind: 'heartRate', source: 'generic_ble', startTime: iso, value: bpm, unit: 'bpm' },
    ]).catch(() => {
      /* never block the live stream on a transient ingest failure */
    });
  }

  // ── disconnect ────────────────────────────────────────────────────────────────
  async disconnect(): Promise<void> {
    const mgr = this.getManager();
    const id = this.state.device?.id;
    this.hrSub?.remove();
    this.hrSub = null;
    try {
      if (mgr && id) await mgr.cancelDeviceConnection(id);
    } catch {
      /* idempotent */
    }
    await AsyncStorage.removeItem(LAST_DEVICE_KEY).catch(() => undefined);
    this.set({ status: 'idle', device: null, heartRate: null, battery: null, error: null });
  }

  private async persistDevice(id: string, name: string): Promise<void> {
    await AsyncStorage.setItem(LAST_DEVICE_KEY, JSON.stringify({ id, name })).catch(() => undefined);
  }

  /** Re-read the last paired device id from storage (for a reconnect button). */
  async getRememberedDevice(): Promise<{ id: string; name: string } | null> {
    try {
      const raw = await AsyncStorage.getItem(LAST_DEVICE_KEY);
      return raw ? (JSON.parse(raw) as { id: string; name: string }) : null;
    } catch {
      return null;
    }
  }

  // ── adapter-shaped getters for the Connected-Devices row ─────────────────────
  /** Maps BLE state onto the devices-screen status vocabulary. */
  getStatusForRow(): 'connected' | 'unavailable' | 'disconnected' {
    if (this.state.status === 'connected') return 'connected';
    if (this.state.status === 'unsupported') return 'unavailable';
    return 'disconnected';
  }

  lastReadingAt(): string | null {
    return this.state.lastReadingAt;
  }
}

/** App-wide singleton — one radio, one connection. */
export const bleManager = new BleWearableManager();
