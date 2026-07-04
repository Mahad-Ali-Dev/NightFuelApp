/**
 * useBle — React binding over the {@link bleManager} singleton for the BLE
 * connect screen. Exposes the live manager state, the running scan-result list,
 * and the scan/connect/disconnect actions. All actions are safe no-ops when BLE
 * is unsupported (Expo Go / jest) — the manager guarantees nothing throws.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { bleManager, type BleState, type BleScanResult, type BleAdapterState } from './bleManager';

export interface UseBle {
  state: BleState;
  supported: boolean;
  scanning: boolean;
  /** Coarse power state of the phone's Bluetooth adapter (on/off/…). */
  adapterState: BleAdapterState;
  results: BleScanResult[];
  startScan: () => void;
  stopScan: () => void;
  connect: (id: string, name: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Ask the OS to turn Bluetooth on (Android prompts; iOS resolves false). */
  enableAdapter: () => Promise<boolean>;
  /** Re-read the adapter power state (e.g. on screen focus / mount). */
  refreshAdapterState: () => Promise<BleAdapterState>;
}

export function useBle(): UseBle {
  const [state, setState] = useState<BleState>(() => bleManager.getState());
  const [results, setResults] = useState<BleScanResult[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const unsub = bleManager.subscribe((s) => {
      if (mounted.current) setState(s);
    });
    // Probe the adapter power state on mount so the "Bluetooth is off" banner is
    // accurate the moment the screen opens (not only after a state change).
    void bleManager.refreshAdapterState();
    return () => {
      mounted.current = false;
      bleManager.stopScan();
      unsub();
    };
  }, []);

  const startScan = useCallback(() => {
    setResults([]);
    void bleManager.startScan((d) => {
      if (!mounted.current) return;
      // De-dupe + keep the strongest signal first.
      setResults((prev) => {
        if (prev.some((p) => p.id === d.id)) return prev;
        return [...prev, d].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
      });
    });
  }, []);

  const stopScan = useCallback(() => bleManager.stopScan(), []);
  const connect = useCallback(async (id: string, name: string) => {
    await bleManager.connect(id, name);
  }, []);
  const disconnect = useCallback(async () => {
    await bleManager.disconnect();
  }, []);
  const enableAdapter = useCallback(() => bleManager.enableAdapter(), []);
  const refreshAdapterState = useCallback(() => bleManager.refreshAdapterState(), []);

  return {
    state,
    supported: bleManager.isSupported(),
    scanning: state.status === 'scanning',
    adapterState: state.adapterState,
    results,
    startScan,
    stopScan,
    connect,
    disconnect,
    enableAdapter,
    refreshAdapterState,
  };
}
