/**
 * training-workout.persistence.test.tsx
 *
 * CAPSTONE / anti-dormant proof for the change that lifts the (real) SetLogger's
 * in-row mutations into the Active Workout screen's PERSISTED set model
 * (`app/training/workout.tsx` → `exerciseStates[eIdx].sets`). The sibling
 * training-workout.wiring.test.tsx already proves a toggle/edit/remove reaches
 * the HEADER count + the forwarded /complete summary volume; THIS suite is the
 * distinct end-to-end persistence proof the wiring suite does NOT make — it binds
 * the same in-row gestures to BOTH durable sinks of the persisted truth:
 *
 *   (a) the 5s AsyncStorage SNAPSHOT — the screen's persistence effect serialises
 *       `exerciseStates` to STORAGE_KEY_STATE every PERSIST_INTERVAL_MS (5000);
 *       advancing fake timers past one interval must capture a payload whose
 *       `exercises[0].sets` reflects the UPDATED truth (removed set absent; edited
 *       kg/reps present; toggled-off set completed:false), and
 *   (b) the FINISH-time `logSessionExercise(sessionId, …)` call — handleEnd
 *       derives `{ sets, reps, weightKg }` from `ex.sets.filter(s => s.completed)`,
 *       so a removed set is not counted, an edited kg moves the Math.max weight,
 *       and a toggled-off set lowers both the completed count and the volume.
 *
 * Because BOTH sinks read the SAME `exerciseStates` ground truth (state-ground-
 * truth: `completed` is a per-set flag, never a parallel counter; the in-row
 * persist updaters are immutable dispatch updaters — react-state-dispatcher),
 * this suite FAILS LOUDLY if the lift ever regresses to display-only: a
 * SetLogger-local edit that never reaches `exerciseStates` would leave the
 * AsyncStorage snapshot AND the logSessionExercise payload on the ORIGINAL seeded
 * values, tripping every assertion below.
 *
 * Mock conventions mirror training-workout.wiring.test.tsx (fake timers freeze
 * the elapsed/startup intervals + drive the 5s persist tick; expo-router with a
 * sessionId param + a hoisted mockReplace; react-query useQuery branched on
 * queryKey[0]; useMutation/useQueryClient benign stubs; expo-status-bar /
 * expo-image / expo-linear-gradient / SafeBlurView / confetti / vector-icons /
 * safe-area stubbed). CRUCIALLY this suite does NOT mock @/components/workout/
 * SetLogger — it renders for real (the whole point is to prove the screen reaches
 * its mutations) — and it captures BOTH AsyncStorage.setItem payloads and
 * @/api/exercises logSessionExercise args so the persistence chain is observable.
 * react-native-svg (RestTimer's ring) is in jest-expo's transform whitelist, so
 * it renders to host primitives unstubbed.
 *
 * Additive: NEW test file only (owns no production source; does not touch the
 * wiring/states suites or the components they exercise).
 */

// ── jest.mock hoisting block (runs ABOVE the imports) ────────────────────────

// A present sessionId enables the ['active-session', id] query AND gives handleEnd
// a non-empty sessionId so it takes the logSessionExercise branch (not the
// sessionId-less early return). `mockReplace` is hoisted so the FINISH assertions
// can confirm navigation fired exactly once after the summary work completed.
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ sessionId: 'sess-1' }),
}));

// react-query: branch useQuery on queryKey[0]. The restore path (AsyncStorage
// getItem → the RESTORED fixture) seeds exercises directly, so the active-session
// query only needs to resolve benignly; resolved-card detail/last-set queries
// default to empty. useMutation / useQueryClient are benign stubs.
//
// CRUCIAL: `data` and `refetch` are STABLE references (a hoisted constant + a
// shared spy), not fresh object/fn literals per call. The screen's init effect
// lists `session` in its dependency array, so returning a NEW `{…}` each render
// would re-run init → setState → re-render → new object → an infinite render
// loop. Mirrors training-workout.wiring.test.tsx's hoisted `mockSession`.
const mockSession = { id: 'sess-1', startedAt: '2026-06-17T20:00:00.000Z', logs: [] };
const mockRefetch = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'active-session') {
      return { data: mockSession, isLoading: false, isError: false, refetch: mockRefetch };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: mockRefetch };
  },
  useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, reset: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// API module the screen statically imports. logSessionExercise is the FINISH-time
// sink this suite captures (jest.fn → records its args); the rest are plain stubs
// so axios (via @/api/client) never loads. endSession resolves so handleEnd's
// `await endSession(...)` settles cleanly under fake timers.
jest.mock('@/api/exercises', () => ({
  getActiveSession: jest.fn(),
  getRoutines: jest.fn(),
  startSession: jest.fn().mockResolvedValue({ id: 'sess-1' }),
  logSessionExercise: jest.fn().mockResolvedValue(undefined),
  endSession: jest.fn().mockResolvedValue(undefined),
  getById: jest.fn(),
}));

// AsyncStorage: the OTHER sink this suite captures. getItem is overridden per-test
// to return the RESTORED snapshot (so init takes the restore branch and seeds the
// exercise with already-logged sets); setItem records every persisted payload so
// the snapshot assertion can read the most-recent STORAGE_KEY_STATE write.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

// Decorative glyphs → plain <Text> surfacing the icon name (mirrors the suites,
// and lets the real SetLogger's checkmark / remove / done icons render without
// expo-font).
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// Native-module-backed visuals → passthrough Views.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});
jest.mock('expo-linear-gradient', () => {
  const RN = require('react-native');
  return { LinearGradient: (props: any) => <RN.View {...props} /> };
});
jest.mock('react-native-confetti-cannon', () => () => null);
jest.mock('@/components/SafeBlurView', () => {
  const RN = require('react-native');
  return { SafeBlurView: (props: any) => <RN.View {...props} /> };
});

// expo-status-bar renders nothing in the tree under test.
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';
import ActiveWorkoutScreen from '../../app/training/workout';

// The exact module instances the screen imports — same singletons (jest hoists
// the mocks), so these capture the screen's real calls.
const AsyncStorage = require('@react-native-async-storage/async-storage');
const { logSessionExercise } = require('@/api/exercises');

// Kept in sync with app/training/workout.tsx (STORAGE_KEY_STATE / PERSIST_INTERVAL_MS).
// The screen does not export them; duplicating the two literals here is the
// price of asserting against the real persisted key + interval.
const STORAGE_KEY_STATE = 'nf_active_workout_state';
const PERSIST_INTERVAL_MS = 5000;

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <ActiveWorkoutScreen />
    </ThemeContext.Provider>,
  );
}

/** Flush an awaited microtask (e.g. the init effect's AsyncStorage.getItem). */
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Restored snapshot: ONE exercise (Bench Press, 90s rest) with 3 sets — two
 * completed (50kg × 10) + one pending. Restoring from AsyncStorage takes the
 * screen's early restore branch, which does NOT arm the 3-2-1 startup countdown,
 * so `isStarting` is false immediately and the first card is expanded by default
 * → its (real) SetLogger maps row i 1:1 to exerciseStates[0].sets[i]. The
 * sessionId is present so handleEnd logs (no startSession, no sessionId-less
 * early return).
 */
const RESTORED = {
  sessionId: 'sess-1',
  startedAt: new Date(2026, 5, 17, 19, 30, 0).getTime(), // 30 min before "now"
  elapsedSeconds: 0,
  exercises: [
    {
      name: 'Bench Press',
      muscleGroup: 'Chest',
      restSeconds: 90,
      sets: [
        { kg: 50, reps: 10, completed: true },
        { kg: 50, reps: 10, completed: true },
        { kg: 50, reps: 10, completed: false },
      ],
    },
  ],
};

/** Render the restored session and flush init (+ any follow-up restore microtask). */
async function renderRestored() {
  AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(RESTORED));
  renderScreen();
  await flushMicrotasks();
  await flushMicrotasks();
}

/**
 * Drive the three in-row mutations on the default-expanded card's (real)
 * SetLogger, in an order whose effect on exerciseStates[0].sets is unambiguous:
 *
 *   start:  [ {50,10,✓}, {50,10,✓}, {50,10,✗} ]
 *   1) toggle set 1 OFF   → onToggleDone(0) → sets[0].completed = false
 *   2) edit set 2 reps+kg → onEditSet(1, …) → sets[1] = {60,12, completed:true}
 *   3) remove set 3       → onRemoveSet(2)  → drop sets[2]
 *   end:    [ {50,10,✗}, {60,12,✓} ]
 *
 * Remove is LAST so the SetLogger's index-keyed rows stay aligned with the
 * parent's sets through the toggle + edit (both in-place .map keep order); the
 * single remaining completed set is the EDITED one, making the finish-time
 * arithmetic a single, distinct value.
 */
function applyToggleEditRemove() {
  // 1) Toggle set 1 DONE off.
  fireEvent.press(screen.getByRole('button', { name: 'Mark set 1 done' }));
  // 2) Edit set 2: reps 10 → 12, kg 50 → 60 (each valid edit also marks it done).
  fireEvent.changeText(screen.getByLabelText('Reps for set 2'), '12');
  fireEvent.changeText(screen.getByLabelText('Weight in kilograms for set 2'), '60');
  // 3) Remove set 3 (the pending set).
  fireEvent.press(screen.getByRole('button', { name: 'Remove set 3' }));
}

/** The most-recent AsyncStorage.setItem(STORAGE_KEY_STATE, …) payload, parsed. */
function latestPersistedState(): any {
  const writes = AsyncStorage.setItem.mock.calls.filter(
    ([key]: [string]) => key === STORAGE_KEY_STATE,
  );
  expect(writes.length).toBeGreaterThan(0); // the 5s persist tick must have fired
  const [, json] = writes[writes.length - 1];
  return JSON.parse(json as string);
}

/**
 * Finish the workout and return the args handleEnd passed to logSessionExercise
 * for the (single) exercise. handleEnd derives the summary from
 * exerciseStates.sets[].completed, fires logSessionExercise per exercise inside
 * `await Promise.all(...)`, then navigates after a 2.5s confetti delay — so we
 * flush the finish microtasks AND advance past the delay before reading.
 */
async function finishAndReadLoggedExercise(): Promise<any> {
  await act(async () => {
    // Press the FINISH Button via its accessibilityLabel (targets the Pressable,
    // mirroring how the wiring suite presses it).
    fireEvent.press(screen.getByLabelText('Finish workout'));
  });
  await act(async () => {
    jest.advanceTimersByTime(2500);
    await Promise.resolve();
  });
  expect(mockReplace).toHaveBeenCalledTimes(1);
  expect(logSessionExercise).toHaveBeenCalledTimes(1);
  const [sid, payload] = logSessionExercise.mock.calls[0];
  expect(sid).toBe('sess-1');
  return payload;
}

describe('ActiveWorkoutScreen — in-row edits PERSIST end-to-end (AsyncStorage snapshot + Finish log)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 17, 20, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    // clearAllMocks wipes call data but not implementations; restore the defaults
    // so an ordering change between tests can't leak a stale getItem snapshot or a
    // rejected logSessionExercise/endSession.
    AsyncStorage.getItem.mockResolvedValue(null);
    logSessionExercise.mockResolvedValue(undefined);
  });

  // ── (a) The 5s AsyncStorage snapshot reflects the UPDATED ex.sets ──────────
  // Advancing past one PERSIST_INTERVAL_MS after the three mutations must write a
  // STORAGE_KEY_STATE payload whose exercises[0].sets is the UPDATED truth — proof
  // the toggle/edit/remove reached the persisted model the snapshot serialises,
  // not just SetLogger-local state. Asserted BEFORE finishing (handleEnd removes
  // the key + tears down the persist interval), matching the change's contract.
  test('the 5s persisted snapshot contains the toggled-off / edited / removed sets', async () => {
    await renderRestored();

    applyToggleEditRemove();

    // Advance past one persist interval (the effect re-armed a fresh 5s interval
    // on the last setState, so we tick from the latest mutation) and flush the
    // async setItem write inside the interval callback.
    await act(async () => {
      jest.advanceTimersByTime(PERSIST_INTERVAL_MS);
      await Promise.resolve();
    });

    const persisted = latestPersistedState();
    expect(persisted.sessionId).toBe('sess-1');
    const sets = persisted.exercises[0].sets;

    // Removed set is ABSENT: 3 seeded → 2 remaining.
    expect(sets).toHaveLength(2);

    // Set 1 was toggled OFF — its raw numbers are untouched but completed:false.
    expect(sets[0]).toMatchObject({ kg: 50, reps: 10, completed: false });

    // Set 2 carries the EDITED kg/reps (and stays completed — an explicit edit of
    // a logged set means it stands).
    expect(sets[1]).toMatchObject({ kg: 60, reps: 12, completed: true });

    // Exactly ONE completed set (the edited one) and ONE incomplete set (the
    // toggled-off one) survive: the removed pending set is genuinely gone, not
    // lingering as a second `completed:false` entry. Under a display-only
    // regression the snapshot would instead carry the 3 original sets (two
    // completed + the still-present pending one), tripping these counts.
    expect(sets.filter((s: any) => s.completed).length).toBe(1);
    expect(sets.filter((s: any) => !s.completed).length).toBe(1);
  });

  // ── (b) The FINISH-time logSessionExercise payload reflects the same edits ──
  // handleEnd reads the SAME exerciseStates.sets[].completed. After the three
  // mutations only the edited set (60×12) remains completed, so the logged
  // payload must be sets:1 / reps:12 / weightKg:60 — every field changed by a
  // different gesture: remove dropped the set count, the edit moved reps + the
  // Math.max weight, and the toggle-off cut the would-be second completed set.
  test('Finish logs sets/reps/weight derived from the edited ex.sets', async () => {
    await renderRestored();

    applyToggleEditRemove();

    const payload = await finishAndReadLoggedExercise();

    expect(payload.exerciseName).toBe('Bench Press');
    // 1 completed set remains (toggle-off removed one, remove dropped the pending
    // one) — NOT the seeded 2.
    expect(payload.sets).toBe(1);
    // reps = mean of completed sets = the edited 12 (NOT the seeded 10).
    expect(payload.reps).toBe(12);
    // weightKg = Math.max over completed sets = the edited 60 (NOT the seeded 50).
    expect(payload.weightKg).toBe(60);
    expect(payload.durationSecs).toBe(0);
  });

  // ── Per-claim isolation: each gesture independently moves the finish payload ─
  // Splitting the gestures pins each acceptance claim distinctly, so a PARTIAL
  // regression (e.g. only the edit fails to persist) fails its own test rather
  // than hiding behind the others. Each re-establishes the chain from the seed.

  test('a removed completed set is excluded from the finish count and volume', async () => {
    await renderRestored();

    // Seed: 2 completed 50×10 sets → would log sets:2, weight:50, mean reps:10.
    // Remove set 1 (a completed set). Only set 2 (50×10) stays completed.
    fireEvent.press(screen.getByRole('button', { name: 'Remove set 1' }));

    const payload = await finishAndReadLoggedExercise();
    expect(payload.sets).toBe(1); // the removed completed set is not counted
    expect(payload.weightKg).toBe(50);
    expect(payload.reps).toBe(10);
  });

  test('an edited kg moves the Math.max weight in the finish payload', async () => {
    await renderRestored();

    // Edit set 1's kg 50 → 80 (set 2 stays 50). Both sets completed → Math.max is
    // now 80, proving the edit reached the persisted value the weight derives from.
    fireEvent.changeText(screen.getByLabelText('Weight in kilograms for set 1'), '80');

    const payload = await finishAndReadLoggedExercise();
    expect(payload.sets).toBe(2);
    expect(payload.weightKg).toBe(80); // was 50 before the edit
  });

  test('toggling a logged set DONE off lowers the finish count', async () => {
    await renderRestored();

    // Toggle set 1 OFF → only set 2 (50×10) stays completed.
    fireEvent.press(screen.getByRole('button', { name: 'Mark set 1 done' }));

    const payload = await finishAndReadLoggedExercise();
    expect(payload.sets).toBe(1); // was 2 before the toggle-off
    expect(payload.weightKg).toBe(50);
    expect(payload.reps).toBe(10);
  });
});
