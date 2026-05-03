import { useCallback, useRef, useState } from 'react';

/**
 * In-memory sliding-window rate limiter for client UX.
 *
 * The authoritative rate limit lives server-side (Redis token bucket on
 * `ai-pipeline`). This hook gives users an immediate "slow down" toast
 * instead of letting them spam-tap and get walls of "429 too many requests"
 * errors after the round-trip.
 *
 * Resets on app restart — that's intentional: cheap, no AsyncStorage cost,
 * and the server is still the source of truth.
 *
 * Usage:
 *   const { canCall, retryAfterSec, recordCall } = useRateLimit({
 *     max: 10,
 *     windowMs: 60_000,
 *   });
 *
 *   const onSend = () => {
 *     if (!canCall()) {
 *       toast(`Slow down — try again in ${retryAfterSec}s`);
 *       return;
 *     }
 *     recordCall();
 *     send(...);
 *   };
 */
export interface RateLimitConfig {
  /** Max calls allowed in the window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** Returns true if a call is allowed RIGHT NOW. Doesn't record anything. */
  canCall: () => boolean;
  /** Records a call. Caller should always do `if (canCall()) { recordCall(); ... }`. */
  recordCall: () => void;
  /** Seconds until the next call would be allowed. 0 if a call is allowed now. */
  retryAfterSec: number;
  /** Calls remaining in the current window. */
  callsRemaining: number;
}

export function useRateLimit({ max, windowMs }: RateLimitConfig): RateLimitResult {
  const callsRef = useRef<number[]>([]);
  // forceRender cycles when retry timer ticks, so consumers re-render their
  // "X seconds remaining" text. We don't need to render on every canCall
  // check — only on recordCall and on a 1s interval when over the limit.
  const [, setTick] = useState(0);

  const prune = useCallback(() => {
    const cutoff = Date.now() - windowMs;
    callsRef.current = callsRef.current.filter((t) => t > cutoff);
  }, [windowMs]);

  const canCall = useCallback(() => {
    prune();
    return callsRef.current.length < max;
  }, [prune, max]);

  const recordCall = useCallback(() => {
    prune();
    callsRef.current.push(Date.now());
    setTick((n) => n + 1);
  }, [prune]);

  prune();
  const callsRemaining = Math.max(0, max - callsRef.current.length);
  const oldest = callsRef.current[0];
  const retryAfterMs = oldest != null ? Math.max(0, oldest + windowMs - Date.now()) : 0;
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);

  return { canCall, recordCall, retryAfterSec, callsRemaining };
}
