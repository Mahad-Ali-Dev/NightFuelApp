/**
 * pedometer.ts — PHONE step counting (no wearable required).
 *
 * Reads TODAY's step count straight off the phone's motion co-processor via
 * `expo-sensors`' Pedometer — Apple's CMPedometer on iOS, the step-counter
 * sensor on Android. This is the "works with NO watch" source: a user with no
 * band/watch still sees steps on Home, sourced from the device they're holding.
 *
 * Honest-fallback / seam discipline (mirrors src/lib/ble/bleManager.ts and
 * src/lib/healthSyncNative.ts):
 *   - `expo-sensors` is lazy-required behind try/catch. In Expo Go the Pedometer
 *     native module is absent (or `isAvailableAsync()` is false) → `available`
 *     is false and the reader degrades to 0. NOTHING here throws into the caller.
 *   - iOS needs the Motion & Fitness permission; we request it best-effort and
 *     treat any denial / probe failure as `permission:'denied'` + 0 steps,
 *     never an exception.
 *
 * This is a LIVE-sensor seam scoped to the on-device pedometer — full multi-day
 * history from a proprietary watch still rides the Health Connect / Apple Health
 * path (src/lib/healthSyncNative.ts). It reads only TODAY, from local midnight.
 */
import { useEffect, useRef, useState } from 'react';

/** Permission state for the motion sensor (iOS gates reads on this). */
export type PedometerPermission = 'unknown' | 'granted' | 'denied';

export interface PedometerSteps {
  /** Steps counted so far TODAY (local midnight → now). 0 when unavailable. */
  steps: number;
  /** True only when the native Pedometer module reports it can count steps. */
  available: boolean;
  /** iOS Motion permission status; 'granted' on platforms that don't gate it. */
  permission: PedometerPermission;
}

/** Minimal shape of the bits of expo-sensors' Pedometer we use — kept local so
 *  this file typechecks in the gate without the native module installed. */
interface PedometerModule {
  isAvailableAsync(): Promise<boolean>;
  getPermissionsAsync?(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  requestPermissionsAsync?(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  getStepCountAsync(start: Date, end: Date): Promise<{ steps: number }>;
  watchStepCount(cb: (result: { steps: number }) => void): { remove: () => void };
}

/** Lazily resolve the native Pedometer (absent in Expo Go / the jest gate). */
function getPedometer(): PedometerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-sensors') as { Pedometer?: PedometerModule };
    return mod?.Pedometer ?? null;
  } catch {
    return null; // no native module → unsupported, honest no-op
  }
}

/** Local start-of-today (midnight in the device's timezone). */
function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * usePedometerSteps — today's phone step count as reactive state.
 *
 * On mount it probes availability, requests the iOS motion permission, reads the
 * count from local midnight → now, then subscribes to `watchStepCount` for live
 * increments (each tick is added to the midnight baseline). Everything is
 * best-effort: on Expo Go / an unavailable sensor / a denied permission it
 * returns `{ steps: 0, available: false, permission }` and never throws.
 */
export function usePedometerSteps(): PedometerSteps {
  const [steps, setSteps] = useState(0);
  const [available, setAvailable] = useState(false);
  const [permission, setPermission] = useState<PedometerPermission>('unknown');
  // The step total read for local-midnight→now; live watch increments add onto it.
  const baselineRef = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const ped = getPedometer();
    let sub: { remove: () => void } | null = null;

    (async () => {
      if (!ped) {
        // No native module (Expo Go) — honest unavailable, 0 steps.
        if (mounted.current) { setAvailable(false); setPermission('denied'); }
        return;
      }
      try {
        const ok = await ped.isAvailableAsync();
        if (!mounted.current) return;
        setAvailable(ok);
        if (!ok) { setPermission('denied'); return; }

        // iOS Motion & Fitness permission (Android reports granted / no-ops).
        let granted = true;
        if (ped.requestPermissionsAsync) {
          try {
            const cur = ped.getPermissionsAsync ? await ped.getPermissionsAsync() : null;
            granted = cur?.granted ?? (await ped.requestPermissionsAsync()).granted;
          } catch {
            granted = false; // probe/request failed → treat as denied, never throw
          }
        }
        if (!mounted.current) return;
        setPermission(granted ? 'granted' : 'denied');
        if (!granted) return;

        // TODAY's steps from local midnight → now (the initial baseline).
        try {
          const { steps: todaySteps } = await ped.getStepCountAsync(startOfTodayLocal(), new Date());
          if (!mounted.current) return;
          baselineRef.current = todaySteps ?? 0;
          setSteps(baselineRef.current);
        } catch {
          // Some Android devices don't support historical getStepCountAsync;
          // the live watch below still accrues from 0 for this session.
        }

        // Live increments — watchStepCount reports steps since the subscription
        // began, so add it to the midnight baseline for a true today-total.
        sub = ped.watchStepCount((res) => {
          if (!mounted.current) return;
          setSteps(baselineRef.current + (res?.steps ?? 0));
        });
      } catch {
        // Any unexpected native failure degrades to honest-unavailable.
        if (mounted.current) { setAvailable(false); setPermission('denied'); }
      }
    })();

    return () => {
      mounted.current = false;
      try { sub?.remove(); } catch { /* idempotent */ }
    };
  }, []);

  return { steps, available, permission };
}
