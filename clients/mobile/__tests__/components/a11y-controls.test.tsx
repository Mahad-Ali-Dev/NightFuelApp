/**
 * Accessibility GUARD test for the shared logging controls and the screens that
 * use them.
 *
 * This file is a deliberate "lock" on the screen-reader contract of the inputs
 * and buttons used across the night-shift logging flows. Each assertion is
 * written so that REMOVING the relevant accessibility prop (role / label / hint
 * / state) turns the test RED. That is the whole point: it stops a future
 * refactor from silently dropping a label and leaving a control unannounced to
 * VoiceOver / TalkBack.
 *
 * Everything here is RENDER-based. We mount the real components and screens
 * (through the shared `__tests__/test-utils/mock-harness`) and read the live
 * accessibility props off the rendered nodes:
 *
 *   - DateTimeField + ExerciseDemo — the shared UI primitives, mounted directly
 *     under the `@/` alias with light mocks (native picker, expo-image,
 *     @expo/vector-icons).
 *   - log-shift / log-sleep / active-workout — the `app/(modals)/` screens,
 *     mounted through the harness which stubs expo-router, @tanstack/react-query,
 *     the axios-backed api modules and the native bits they pull in.
 *
 * Because the assertions read the LIVE nodes, renaming a label *string* in a
 * screen (without removing the prop) keeps the test green, while DELETING an
 * `accessibilityLabel` / `accessibilityRole` from an audited control turns it
 * red — which a previous `fs.readFileSync` + `toContain('accessibilityLabel=…')`
 * grep could not distinguish (a reformat or moving the label into a variable
 * defeated that grep while leaving the screen unannounced).
 *
 * KNOWN FINDING (flagged, NOT fixed here — this item must not edit screen src):
 *   active-workout.tsx's per-set WEIGHT and REPS <TextInput>s expose no
 *   `accessibilityLabel` (see the block below). They are queried by their live
 *   placeholder so this guard still mounts and observes them, but a screen
 *   reader announces them only as generic, unlabeled text fields. Adding
 *   `accessibilityLabel="Weight (kg), set N"` / `"Reps, set N"` is a separate
 *   screen change for the active-workout owner.
 */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import {
  renderScreen,
  mockExpoRouterFactory,
  mockDateTimePickerFactory,
  mockExpoImageFactory,
  mockVectorIconsFactory,
  mockSafeAreaContextFactory,
  mockReactQueryFactory,
  type HarnessQueryResult,
  type HarnessMutationResult,
} from '../test-utils/mock-harness';

// ── Shared mocks (routed through the harness so other suites reuse them) ─────────
//
// jest.mock is hoisted PER FILE and the last factory for a given module wins, so
// there is exactly ONE mock per module here. The react-query stub dispatches on
// queryKey[0] through a single mutable resolver (`mockQueryState`) and a single
// mutable mutation slice (`mockMutationState`) that individual tests seed. All
// referenced identifiers are `mock`-prefixed, which babel-plugin-jest-hoist
// requires for variables touched inside a hoisted factory.

// Native date/time picker → a host <View>. We never open it (the guard is about
// the trigger's a11y props, not the picker); the stub keeps DateTimeField — and
// every screen that mounts it — importable without the native module.
jest.mock('@react-native-community/datetimepicker', () => mockDateTimePickerFactory());

// expo-image → passthrough host <View> (testID "exercise-demo-image") so
// ExerciseDemo's frames mount and keep their accessibility props readable.
jest.mock('expo-image', () => mockExpoImageFactory());

// Decorative glyphs only.
jest.mock('@expo/vector-icons', () => mockVectorIconsFactory());

// Deterministic insets so the modal screens lay out without the native provider.
jest.mock('react-native-safe-area-context', () => mockSafeAreaContextFactory());

jest.mock('expo-router', () => mockExpoRouterFactory());

// Per-queryKey results the screens read. Seeded in beforeEach / per test.
const mockQueryState: Record<string, HarnessQueryResult> = {};
const idleQuery = (): HarnessQueryResult => ({
  data: undefined,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
});
// Evaluated lazily on every useQuery call so per-test seeding is picked up.
const mockResolveQuery = (queryKey: readonly unknown[]): HarnessQueryResult =>
  mockQueryState[String(queryKey[0])] ?? idleQuery();

// Mutation slice the logging modals read off useMutation(). Flipping
// `isPending` exercises the "Saving …" label branch.
const mockMutationState: HarnessMutationResult = { mutate: jest.fn(), isPending: false };

jest.mock('@tanstack/react-query', () =>
  mockReactQueryFactory(
    () => mockResolveQuery,
    () => mockMutationState,
  ),
);

// API modules are fully stubbed (useQuery/useMutation are mocked, so these are
// never actually called) — the stubs only exist so the screen imports resolve
// without dragging in the real axios client.
jest.mock('@/api/shifts', () => ({ create: jest.fn() }));
jest.mock('@/api/sleep', () => ({ log: jest.fn(), listSessions: jest.fn() }));
jest.mock('@/api/exercises', () => ({ getActiveSession: jest.fn(), getLastSet: jest.fn() }));

// Components imported under the `@/` alias for the primitive-level guards.
import { DateTimeField } from '@/components/ui/DateTimeField';
import { ExerciseDemo } from '@/components/exercise/ExerciseDemo';
// Screens imported AFTER the mocks are registered. The `(modals)` segment is
// outside the `@/` alias, so these use a relative path.
import LogShiftModal from '../../app/(modals)/log-shift';
import LogSleepModal from '../../app/(modals)/log-sleep';
import ActiveWorkoutScreen from '../../app/(modals)/active-workout';

// `renderWithTheme` is kept for the primitive tests below; it now delegates to
// the harness `renderScreen` (identical dark-ThemeContext wrapper) so there is a
// single source of truth for the provider tree.
const renderWithTheme = renderScreen;

const FALLBACK = { testUri: 'bundled-fallback' };
const IMAGE_URL = 'https://cdn.example.com/exercise-hero.jpg';
const FRAME_A = 'https://cdn.example.com/frame-a.png';
const FRAME_B = 'https://cdn.example.com/frame-b.png';
const TUTORIAL_URL = 'https://youtube.com/watch?v=demo';

beforeEach(() => {
  // Reset shared query/mutation state between tests so seeding never leaks.
  for (const k of Object.keys(mockQueryState)) delete mockQueryState[k];
  mockMutationState.isPending = false;
  mockMutationState.mutate = jest.fn();
});

// ── DateTimeField: role + value-bearing label + picker hint ─────────────────────

describe('a11y guard — DateTimeField trigger', () => {
  test('date mode exposes button role, a value-bearing label, and an "opens a date picker" hint', () => {
    renderWithTheme(<DateTimeField mode="date" value="2026-06-17" onChange={() => {}} />);

    // Reachable by a label that names the field AND announces the current value.
    const trigger = screen.getByLabelText('Select date, currently 2026-06-17');
    expect(trigger.props.accessibilityRole).toBe('button');
    // The hint must tell a screen-reader user the control opens a picker.
    expect(trigger.props.accessibilityHint).toBe('Opens a date picker');
  });

  test('time mode exposes button role, a value-bearing label, and an "opens a time picker" hint', () => {
    renderWithTheme(<DateTimeField mode="time" value="19:00" onChange={() => {}} />);

    const trigger = screen.getByLabelText('Select time, currently 19:00');
    expect(trigger.props.accessibilityRole).toBe('button');
    expect(trigger.props.accessibilityHint).toBe('Opens a time picker');
  });

  test('a caller-supplied accessibilityLabel still carries role + picker hint', () => {
    renderWithTheme(
      <DateTimeField
        mode="date"
        value="2026-06-17"
        accessibilityLabel="Select sleep start date, currently 2026-06-17"
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByLabelText('Select sleep start date, currently 2026-06-17');
    expect(trigger.props.accessibilityRole).toBe('button');
    expect(trigger.props.accessibilityHint).toBe('Opens a date picker');
  });

  test('the "Now" quick-fill affordance exposes a button role + mode-specific label', () => {
    renderWithTheme(<DateTimeField mode="time" value="19:00" onChange={() => {}} onNow={() => {}} />);
    const nowBtn = screen.getByLabelText('Use current time');
    expect(nowBtn.props.accessibilityRole).toBe('button');
  });
});

// ── ExerciseDemo: play/pause button, still image, tutorial link, coming-soon ────

describe('a11y guard — ExerciseDemo controls', () => {
  describe('animated (2+ frames) → play/pause button', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('the looping player is a button with a label, paused state, and a toggle hint', () => {
      renderWithTheme(
        <ExerciseDemo frames={[FRAME_A, FRAME_B]} imageUrl={IMAGE_URL} fallback={FALLBACK} />,
      );
      const control = screen.getByLabelText('Pause demo');
      expect(control.props.accessibilityRole).toBe('button');
      // A hint is required because this control toggles (pause/resume).
      expect(control.props.accessibilityHint).toBe('Double tap to pause or resume the looping demo');
      // State is exposed so the toggle's current position is announced.
      expect(control.props.accessibilityState).toMatchObject({ selected: false, busy: true });
    });
  });

  test('a single-frame still exposes the non-interactive "image" role + a label', () => {
    renderWithTheme(<ExerciseDemo frames={[FRAME_A]} imageUrl={IMAGE_URL} fallback={FALLBACK} />);
    const still = screen.getByLabelText('Exercise demo');
    expect(still.props.accessibilityRole).toBe('image');
  });

  test('the no-media state is a labelled region', () => {
    renderWithTheme(
      <ExerciseDemo frames={null} gifUrl={null} imageUrl={IMAGE_URL} fallback={FALLBACK} />,
    );
    // The "coming soon" wrapper is labelled so the whole region is announced.
    expect(screen.getByLabelText('Exercise demo')).toBeTruthy();
  });

  test('the "Full tutorial" affordance exposes a link role + label when a tutorialUrl exists', () => {
    renderWithTheme(
      <ExerciseDemo
        frames={null}
        gifUrl={null}
        imageUrl={IMAGE_URL}
        fallback={FALLBACK}
        tutorialUrl={TUTORIAL_URL}
      />,
    );
    const link = screen.getByLabelText('Open full tutorial');
    expect(link.props.accessibilityRole).toBe('link');
  });
});

// ── log-shift screen: render-based guard on the audited controls ─────────────────
// Mounted through the harness; we read the LIVE a11y props off the rendered
// nodes. Deleting an audited prop fails the matching assertion; renaming the
// label string (keeping the prop) does not.

describe('a11y guard — log-shift screen controls (rendered)', () => {
  test('the close button is a labelled button', () => {
    renderWithTheme(<LogShiftModal />);
    const close = screen.getByLabelText('Close');
    expect(close.props.accessibilityRole).toBe('button');
  });

  test('the save control announces its label + disabled/busy state (idle → "Save shift")', () => {
    renderWithTheme(<LogShiftModal />);
    // "Save shift" is exposed by BOTH the header action and the bottom Button,
    // so assert against the set and that each carries the button role + state.
    const saves = screen.getAllByLabelText('Save shift');
    expect(saves.length).toBeGreaterThanOrEqual(1);
    for (const node of saves) {
      expect(node.props.accessibilityRole).toBe('button');
      // Idle (not pending, no errors) → not busy.
      expect(node.props.accessibilityState).toMatchObject({ busy: false });
    }
    // The pending label must NOT be present while idle.
    expect(screen.queryByLabelText('Saving shift')).toBeNull();
  });

  test('the save control flips to the "Saving shift" label + busy state while the mutation is pending', () => {
    mockMutationState.isPending = true;
    renderWithTheme(<LogShiftModal />);
    const saving = screen.getAllByLabelText('Saving shift');
    expect(saving.length).toBeGreaterThanOrEqual(1);
    for (const node of saving) {
      expect(node.props.accessibilityRole).toBe('button');
      expect(node.props.accessibilityState).toMatchObject({ busy: true });
    }
    // The idle label is gone while pending.
    expect(screen.queryByLabelText('Save shift')).toBeNull();
  });

  test('each shift-type chip is a button labelled by its type, exposing its selected state', () => {
    renderWithTheme(<LogShiftModal />);
    // The five shift-type chips. FIXED_NIGHT is the default selection.
    const fixedNight = screen.getByLabelText('Fixed Night');
    expect(fixedNight.props.accessibilityRole).toBe('button');
    expect(fixedNight.props.accessibilityState).toMatchObject({ selected: true });

    const rotating = screen.getByLabelText('Rotating');
    expect(rotating.props.accessibilityRole).toBe('button');
    expect(rotating.props.accessibilityState).toMatchObject({ selected: false });

    // Tapping a different chip moves the selection (state is live, not static).
    fireEvent.press(rotating);
    expect(screen.getByLabelText('Rotating').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByLabelText('Fixed Night').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  test('the rest-day Switch is labelled and exposes its checked state', () => {
    renderWithTheme(<LogShiftModal />);
    const restDay = screen.getByLabelText('Rest day (day off)');
    expect(restDay.props.accessibilityRole).toBe('switch');
    expect(restDay.props.accessibilityState).toMatchObject({ checked: false });

    fireEvent(restDay, 'valueChange', true);
    expect(screen.getByLabelText('Rest day (day off)').props.accessibilityState).toMatchObject({
      checked: true,
    });
  });

  test('the commute-minutes numeric input is labelled', () => {
    renderWithTheme(<LogShiftModal />);
    expect(screen.getByLabelText('Commute time in minutes')).toBeTruthy();
  });
});

// ── log-sleep screen: render-based guard on the audited controls ─────────────────
// The form (quality/disturbances/notes/date-time/save) is gated behind the
// "Log new sleep" entry button, so we press it first to reveal those controls.

describe('a11y guard — log-sleep screen controls (rendered)', () => {
  // Empty saved-sessions list so the screen renders the entry button (and not a
  // loading skeleton) and the form can be opened.
  beforeEach(() => {
    mockQueryState['sleep-sessions'] = {
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
  });

  test('the close button is a labelled button', () => {
    renderWithTheme(<LogSleepModal />);
    const close = screen.getByLabelText('Close');
    expect(close.props.accessibilityRole).toBe('button');
  });

  test('the "Log new sleep" entry button is a labelled button', () => {
    renderWithTheme(<LogSleepModal />);
    const entry = screen.getByLabelText('Log new sleep');
    expect(entry.props.accessibilityRole).toBe('button');
  });

  test('opening the form reveals the save control with its label + busy state (idle → "Save recovery data")', () => {
    renderWithTheme(<LogSleepModal />);
    fireEvent.press(screen.getByLabelText('Log new sleep'));

    const save = screen.getByLabelText('Save recovery data');
    expect(save.props.accessibilityRole).toBe('button');
    expect(save.props.accessibilityState).toMatchObject({ busy: false });
    expect(screen.queryByLabelText('Saving recovery data')).toBeNull();
  });

  test('the save control flips to "Saving recovery data" + busy state while the mutation is pending', () => {
    mockMutationState.isPending = true;
    renderWithTheme(<LogSleepModal />);
    fireEvent.press(screen.getByLabelText('Log new sleep'));

    const saving = screen.getByLabelText('Saving recovery data');
    expect(saving.props.accessibilityRole).toBe('button');
    expect(saving.props.accessibilityState).toMatchObject({ busy: true });
    expect(screen.queryByLabelText('Save recovery data')).toBeNull();
  });

  test('the sleep-quality rating buttons are labelled with their value and expose selected state', () => {
    renderWithTheme(<LogSleepModal />);
    fireEvent.press(screen.getByLabelText('Log new sleep'));

    // Default quality is 7 → that rating reads as selected, an unselected one not.
    const seven = screen.getByLabelText('Sleep quality 7 out of 10');
    expect(seven.props.accessibilityRole).toBe('button');
    expect(seven.props.accessibilityState).toMatchObject({ selected: true });

    const three = screen.getByLabelText('Sleep quality 3 out of 10');
    expect(three.props.accessibilityRole).toBe('button');
    expect(three.props.accessibilityState).toMatchObject({ selected: false });

    // Selecting a new value moves the selected flag (state is live).
    fireEvent.press(three);
    expect(screen.getByLabelText('Sleep quality 3 out of 10').props.accessibilityState).toMatchObject(
      { selected: true },
    );
  });

  test('the disturbance steppers are labelled buttons', () => {
    renderWithTheme(<LogSleepModal />);
    fireEvent.press(screen.getByLabelText('Log new sleep'));

    const decrease = screen.getByLabelText('Decrease');
    expect(decrease.props.accessibilityRole).toBe('button');
    const add = screen.getByLabelText('Add');
    expect(add.props.accessibilityRole).toBe('button');
  });

  test('the recovery-notes input is labelled', () => {
    renderWithTheme(<LogSleepModal />);
    fireEvent.press(screen.getByLabelText('Log new sleep'));
    expect(screen.getByLabelText('Recovery notes')).toBeTruthy();
  });

  test('the sleep date/time fields pass explicit, value-bearing labels (button role + picker hint)', () => {
    renderWithTheme(<LogSleepModal />);
    fireEvent.press(screen.getByLabelText('Log new sleep'));

    // Default state: startDay/endDay = today, startTime 23:00, endTime 07:00.
    // We assert the label PREFIX + role/hint without pinning the date string, so
    // renaming/retiming stays green but deleting the label/role/hint goes red.
    const startDate = screen.getByLabelText(/^Select sleep start date/);
    expect(startDate.props.accessibilityRole).toBe('button');
    expect(startDate.props.accessibilityHint).toBe('Opens a date picker');

    const endTime = screen.getByLabelText(/^Select sleep end time/);
    expect(endTime.props.accessibilityRole).toBe('button');
    expect(endTime.props.accessibilityHint).toBe('Opens a time picker');
  });
});

// ── active-workout screen: render-based guard on the per-set controls ────────────
// Seed the mocked ['active-session'] query with one exercise (two sets); the
// screen's effect maps it into editable set rows. We then read the live a11y
// props off the set-complete control and observe the weight/reps inputs.
//
// COORDINATION (item 7 — active-workout media additions): the "Complete set"
// control asserted here is the per-set checkmark TouchableOpacity. Media/demo
// additions must NOT remove its accessibilityLabel="Complete set",
// accessibilityRole="button", or accessibilityState={{ selected }}.

describe('a11y guard — active-workout set rows (rendered)', () => {
  const mockSession = {
    id: 'sess-1',
    startedAt: '2026-06-17T20:00:00.000Z',
    logs: [{ exerciseName: 'Bench Press', sets: 2, reps: 8, weightKg: 0, durationSecs: 0 }],
  };

  beforeEach(() => {
    // Freeze the elapsed/rest-timer intervals so they don't tick during a test.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 17, 20, 0, 0));
    mockQueryState['active-session'] = {
      data: mockSession,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
    mockQueryState['exercise-last-sets'] = {
      data: {},
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('the seeded exercise renders set rows with a "Complete set" button exposing selected state', () => {
    renderWithTheme(<ActiveWorkoutScreen />);
    // The exercise card seeded from the active session must be present.
    expect(screen.getByText('Bench Press')).toBeTruthy();

    // Two sets → two "Complete set" controls, each a button starting unselected.
    const completes = screen.getAllByLabelText('Complete set');
    expect(completes.length).toBe(2);
    for (const node of completes) {
      expect(node.props.accessibilityRole).toBe('button');
      expect(node.props.accessibilityState).toMatchObject({ selected: false });
    }
  });

  test('completing a set flips that control\'s selected state (state is live, not static)', () => {
    renderWithTheme(<ActiveWorkoutScreen />);
    const completes = screen.getAllByLabelText('Complete set');

    fireEvent.press(completes[0]!);
    // The first set is now marked done → selected; the second stays unselected.
    const after = screen.getAllByLabelText('Complete set');
    expect(after[0]!.props.accessibilityState).toMatchObject({ selected: true });
    expect(after[1]!.props.accessibilityState).toMatchObject({ selected: false });
  });

  test('each set row mounts a live weight + reps input (editable nodes)', () => {
    // FINDING: these inputs expose NO accessibilityLabel in active-workout.tsx,
    // so a screen reader announces them generically. We therefore query them by
    // their live placeholders (set 1: weight "135", reps "8" from targetReps)
    // rather than by label — this still PROVES the inputs render as real,
    // editable nodes. Adding labels is a separate screen change (see file header).
    renderWithTheme(<ActiveWorkoutScreen />);

    // Set-1 weight placeholder is the literal "135"; reps placeholder is the
    // first token of the target-reps range ("8" here).
    const weightInput = screen.getByPlaceholderText('135');
    expect(weightInput.props.editable).not.toBe(false);

    const repsInputs = screen.getAllByPlaceholderText('8');
    // At least one reps input (set 1 uses target-reps "8" as its placeholder).
    expect(repsInputs.length).toBeGreaterThanOrEqual(1);
    for (const node of repsInputs) {
      expect(node.props.editable).not.toBe(false);
    }

    // Editing the weight input is accepted (the field is wired to updateSet).
    fireEvent.changeText(weightInput, '60');
    expect(screen.getByDisplayValue('60')).toBeTruthy();
  });

  test('the per-set "Add set" affordance remains a labelled button alongside the set rows', () => {
    renderWithTheme(<ActiveWorkoutScreen />);
    const addSet = screen.getByLabelText('Add set');
    expect(addSet.props.accessibilityRole).toBe('button');
  });
});
