/**
 * Tests for useRateLimit — the in-memory sliding-window client rate limiter.
 *
 * Pure hook logic (only react useRef/useState/useCallback + Date.now), so no
 * native mocks are needed. We drive time with jest fake timers so the sliding
 * window is deterministic, and use RNTL's act() around recordCall to flush the
 * state update that re-renders the hook.
 */
import { renderHook, act } from '@testing-library/react-native';
import { useRateLimit } from '@/hooks/useRateLimit';

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-06-13T00:00:00.000Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useRateLimit', () => {
  test('allows calls up to the configured max, then blocks', () => {
    const { result } = renderHook(() => useRateLimit({ max: 3, windowMs: 60_000 }));

    expect(result.current.canCall()).toBe(true);
    expect(result.current.callsRemaining).toBe(3);

    act(() => result.current.recordCall());
    act(() => result.current.recordCall());
    act(() => result.current.recordCall());

    expect(result.current.callsRemaining).toBe(0);
    expect(result.current.canCall()).toBe(false);
  });

  test('callsRemaining decrements with each recorded call', () => {
    const { result } = renderHook(() => useRateLimit({ max: 2, windowMs: 60_000 }));
    expect(result.current.callsRemaining).toBe(2);
    act(() => result.current.recordCall());
    expect(result.current.callsRemaining).toBe(1);
    act(() => result.current.recordCall());
    expect(result.current.callsRemaining).toBe(0);
  });

  test('frees up a slot once the oldest call ages out of the window', () => {
    const { result, rerender } = renderHook(() => useRateLimit({ max: 2, windowMs: 60_000 }));

    act(() => result.current.recordCall()); // t=0
    act(() => result.current.recordCall()); // t=0
    expect(result.current.canCall()).toBe(false);

    // Advance to just before the window closes — still blocked. canCall()
    // prunes live, so it's accurate even without a re-render.
    act(() => {
      jest.advanceTimersByTime(59_999);
    });
    expect(result.current.canCall()).toBe(false);

    // Cross the 60s boundary — the two old calls fall out, slots free up.
    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(result.current.canCall()).toBe(true);
    // callsRemaining is a render-time derived value; re-render to recompute it
    // now that time has advanced past the window.
    rerender(undefined);
    expect(result.current.callsRemaining).toBe(2);
  });

  test('retryAfterSec reports time until the oldest call expires', () => {
    const { result, rerender } = renderHook(() => useRateLimit({ max: 1, windowMs: 60_000 }));

    expect(result.current.retryAfterSec).toBe(0); // nothing recorded yet

    act(() => result.current.recordCall()); // t=0, window 60s
    // Immediately after: ~60s remaining (ceil of 60_000ms).
    expect(result.current.retryAfterSec).toBe(60);

    act(() => {
      jest.advanceTimersByTime(30_000); // 30s elapsed
    });
    // retryAfterSec is derived at render time; re-render to recompute it after
    // advancing the clock (without recording another call).
    rerender(undefined);
    expect(result.current.retryAfterSec).toBe(30);
  });

  test('retryAfterSec is 0 when under the limit / window empty', () => {
    const { result } = renderHook(() => useRateLimit({ max: 5, windowMs: 30_000 }));
    expect(result.current.retryAfterSec).toBe(0);
    act(() => result.current.recordCall());
    // Still has capacity, but oldest entry exists -> retryAfterSec reflects it.
    // The contract: 0 only when no calls recorded; after a call it counts down.
    expect(result.current.retryAfterSec).toBeGreaterThan(0);
  });

  test('canCall does not consume capacity (read-only)', () => {
    const { result } = renderHook(() => useRateLimit({ max: 1, windowMs: 60_000 }));
    // Calling canCall repeatedly must not record anything.
    expect(result.current.canCall()).toBe(true);
    expect(result.current.canCall()).toBe(true);
    expect(result.current.callsRemaining).toBe(1);
  });
});
