/**
 * Tests for useEntrainmentScore — the data hook that projects the two server
 * reads (the active shift + the circadian model) onto the pure
 * <EntrainmentCard /> props `{ score, shift }`.
 *
 * The hook owns NO state (state-ground-truth.md): `score`/`shift` are a pure
 * projection over the react-query results, computed each render. Its contract,
 * pinned here, is:
 *   - missing data (no shift / unresolved model / no derivable score) →
 *     `{ score: null, shift: undefined }` — the honest default-safe path that
 *     renders ENTRAINMENT_ADVICE.none.
 *   - a finite model `entrainmentScore` passes through NORMALIZED into [0,100].
 *   - a malformed model (NaN / wrong type / null) NEVER throws — it degrades to
 *     the null/undefined defaults.
 *   - a well-formed string shift `{ startTime, endTime }` is surfaced; a partial
 *     / wrong-typed shift collapses to `undefined`.
 *
 * We mock react-query's `useQuery` with queryKey routing (mirroring
 * curatedDemos-resolution.test.tsx) so the hook's `['current-shift']` /
 * `['circadian-model']` reads return controllable fixtures, and we stub the two
 * API modules' named exports so the real axios client never loads. (useQuery is
 * mocked, so the queryFns are never actually invoked — they just need to be
 * importable.) NOTE: the SCORE the hook surfaces is tz-NAIVE (local-clock) by
 * design — fixing timezone is deferred; this suite asserts the projection, not
 * tz-correctness.
 */

// A mutable holder per query key, read at call-time (during the hook's render)
// so a test can set fixtures before renderHook and the mock observes them. The
// `mock` prefix is required: jest.mock factories may only reference out-of-scope
// vars whose names start with `mock` (case-insensitive).
let mockShiftData: unknown = undefined;
let mockModelData: unknown = undefined;

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'current-shift') {
      return { data: mockShiftData, isLoading: false, isError: false, refetch: jest.fn() };
    }
    if (queryKey[0] === 'circadian-model') {
      return { data: mockModelData, isLoading: false, isError: false, refetch: jest.fn() };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
}));

// The hook statically imports these named exports; stub them so the real axios
// client never loads. useQuery is mocked above, so they are never invoked.
jest.mock('@/api/shifts', () => ({ getCurrent: jest.fn() }));
jest.mock('@/api/circadian', () => ({ getModel: jest.fn() }));

// Import AFTER the mocks so the hook binds to the mocked useQuery.
import { renderHook } from '@testing-library/react-native';
import { useEntrainmentScore } from '@/components/dashboard/useEntrainmentScore';

beforeEach(() => {
  mockShiftData = undefined;
  mockModelData = undefined;
});

describe('useEntrainmentScore', () => {
  describe('missing data → honest null/undefined defaults', () => {
    test('no shift and no model → { score: null, shift: undefined }', () => {
      const { result } = renderHook(() => useEntrainmentScore());
      expect(result.current).toEqual({ score: null, shift: undefined });
    });

    test('a shift present but model unresolved → score null, shift surfaced', () => {
      mockShiftData = { startTime: '2026-01-02T22:00:00.000Z', endTime: '2026-01-03T06:00:00.000Z' };
      mockModelData = undefined; // model query gated/unresolved
      const { result } = renderHook(() => useEntrainmentScore());
      expect(result.current.score).toBeNull();
      expect(result.current.shift).toEqual({
        startTime: '2026-01-02T22:00:00.000Z',
        endTime: '2026-01-03T06:00:00.000Z',
      });
    });
  });

  describe('finite model score passes through normalized', () => {
    test('an in-range score is surfaced unchanged', () => {
      mockModelData = { entrainmentScore: 88 };
      const { result } = renderHook(() => useEntrainmentScore());
      expect(result.current.score).toBe(88);
    });

    test('a score above 100 is clamped to 100', () => {
      mockModelData = { entrainmentScore: 140 };
      const { result } = renderHook(() => useEntrainmentScore());
      expect(result.current.score).toBe(100);
    });

    test('a negative score is clamped to 0', () => {
      mockModelData = { entrainmentScore: -25 };
      const { result } = renderHook(() => useEntrainmentScore());
      expect(result.current.score).toBe(0);
    });

    test('a finite zero score is surfaced as 0, not coerced to null', () => {
      mockModelData = { entrainmentScore: 0 };
      const { result } = renderHook(() => useEntrainmentScore());
      expect(result.current.score).toBe(0);
    });
  });

  describe('malformed model never throws → null', () => {
    test('NaN score → null', () => {
      mockModelData = { entrainmentScore: NaN };
      const { result } = renderHook(() => useEntrainmentScore());
      expect(result.current.score).toBeNull();
    });

    test('non-numeric score → null', () => {
      mockModelData = { entrainmentScore: 'high' };
      const { result } = renderHook(() => useEntrainmentScore());
      expect(result.current.score).toBeNull();
    });

    test('Infinity score → null', () => {
      mockModelData = { entrainmentScore: Infinity };
      const { result } = renderHook(() => useEntrainmentScore());
      expect(result.current.score).toBeNull();
    });

    test('a model missing entrainmentScore → null, never throws', () => {
      mockModelData = { phases: [] };
      expect(() => renderHook(() => useEntrainmentScore())).not.toThrow();
      const { result } = renderHook(() => useEntrainmentScore());
      expect(result.current.score).toBeNull();
    });

    test('a non-object / garbage model never throws → null', () => {
      mockModelData = 'totally-bogus';
      expect(() => renderHook(() => useEntrainmentScore())).not.toThrow();
      const { result } = renderHook(() => useEntrainmentScore());
      expect(result.current.score).toBeNull();
    });
  });

  describe('shift projection', () => {
    test('a well-formed string shift is surfaced as { startTime, endTime }', () => {
      mockShiftData = {
        id: 's1',
        startTime: '2026-01-02T22:00:00.000Z',
        endTime: '2026-01-03T06:00:00.000Z',
        extra: 'ignored',
      };
      const { result } = renderHook(() => useEntrainmentScore());
      expect(result.current.shift).toEqual({
        startTime: '2026-01-02T22:00:00.000Z',
        endTime: '2026-01-03T06:00:00.000Z',
      });
    });

    test('a partial shift (missing endTime) collapses to undefined', () => {
      mockShiftData = { startTime: '2026-01-02T22:00:00.000Z' };
      const { result } = renderHook(() => useEntrainmentScore());
      expect(result.current.shift).toBeUndefined();
    });

    test('a wrong-typed shift (non-string times) collapses to undefined', () => {
      mockShiftData = { startTime: 123, endTime: 456 };
      const { result } = renderHook(() => useEntrainmentScore());
      expect(result.current.shift).toBeUndefined();
    });

    test('a malformed (non-object) shift never throws → undefined', () => {
      mockShiftData = 'nope';
      expect(() => renderHook(() => useEntrainmentScore())).not.toThrow();
      const { result } = renderHook(() => useEntrainmentScore());
      expect(result.current.shift).toBeUndefined();
    });
  });

  test('full projection: finite score + valid shift surfaced together unchanged', () => {
    mockShiftData = { startTime: '2026-01-02T22:00:00.000Z', endTime: '2026-01-03T06:00:00.000Z' };
    mockModelData = { entrainmentScore: 73 };
    const { result } = renderHook(() => useEntrainmentScore());
    expect(result.current).toEqual({
      score: 73,
      shift: { startTime: '2026-01-02T22:00:00.000Z', endTime: '2026-01-03T06:00:00.000Z' },
    });
  });
});
