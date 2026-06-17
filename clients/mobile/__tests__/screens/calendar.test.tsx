/**
 * Render tests for the Training Calendar screen
 * (`app/(performance)/calendar.tsx`).
 *
 * These tests pin down the three things that were previously fabricated or
 * collapsed across months in that screen:
 *
 *   1. ISO-DATE MATCHING (the core regression). The old grid lit a day with an
 *      activity dot using `new Date(h.date).getDate() === day` — i.e. day-OF-
 *      MONTH only — so a history entry on the 15th of ANY month lit the 15th of
 *      EVERY month. The fix compares the full `YYYY-MM-DD`. We mock getHistory
 *      to return a single entry on 2026-03-15 and assert that:
 *        - in March 2026 the 15th is marked "has activity", and
 *        - after navigating to a DIFFERENT month (April 2026) the 15th is NOT
 *          marked (cross-month negative — would FAIL against the old code).
 *
 *   2. STATE-DRIVEN HEADER + WORKING CHEVRONS. The header was the literal
 *      "March 2026". It now derives from component state, and the two chevrons
 *      decrement / increment the displayed month (rolling the year over the
 *      Dec/Jan boundary). We freeze the clock to March 2026 so the initial
 *      header is deterministic, then drive the chevrons and assert the header
 *      text changes (including a year rollover Jan → Dec of the prior year).
 *
 *   3. HONEST "SCHEDULED SESSIONS". The hardcoded fake sessions array
 *      ("Push Day - Hypertrophy", "Full Body Power") is gone — there is no
 *      planned-sessions endpoint in the mobile API layer — replaced by an
 *      EmptyState ("No sessions scheduled"). We assert the EmptyState renders
 *      and the fabricated strings do NOT.
 *
 *   4. NO DEAD CONTROLS. The screen previously shipped two no-op controls: a
 *      Week/Month/Year view switcher whose `viewMode` state was never read (the
 *      grid always rendered a month, so Week/Year did nothing) and a header "+"
 *      button (accessibilityLabel "Add") with no onPress. Both have been
 *      removed — every remaining control changes what is displayed or navigates.
 *      We assert the switcher tabs and the "Add" button are gone so they can't
 *      silently creep back in as no-ops.
 *
 * Mocks (same conventions as the dashboard suite):
 *  - `@tanstack/react-query` useQuery → the ['activity-history'] query is driven
 *    by a mutable `mockHistoryState` object so each test sets data / isError /
 *    isLoading.
 *  - `@/api/progress` getHistory → jest.fn (never actually called; useQuery is
 *    fully stubbed) just so the import resolves.
 *  - expo-router, @expo/vector-icons, react-native-safe-area-context — stubbed
 *    exactly as the sibling screen tests do.
 *
 * The system clock is frozen with fake timers so "today" (and therefore the
 * initial cursor month + the today-highlight) is deterministic regardless of
 * when the suite runs.
 */
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

// ── Controlled activity-history query state ──────────────────────────────────
type HistoryState = {
  data: any;
  isLoading: boolean;
  isError: boolean;
};
const mockHistoryState: HistoryState = {
  data: [],
  isLoading: false,
  isError: false,
};
const mockHistoryRefetch = jest.fn();

// A small shift list answered by the ['shifts'] query so the "Link to a shift"
// picker renders real options when the form is open.
const mockShifts = [
  {
    id: 'shift_1',
    userId: 'u_1',
    type: 'FIXED_NIGHT',
    startTime: '2026-03-12T19:00:00.000Z',
    endTime: '2026-03-13T07:00:00.000Z',
    timezone: 'UTC',
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
  },
];

// ── Captured TanStack mutation wiring ────────────────────────────────────────
// useMutation is stubbed: it records the { mutationFn, onSuccess, onError }
// passed by the screen so tests can fire them directly, and exposes a mutate
// spy + flags. A mutable `mockMutationState` lets a test flip isPending.
const mockMutate = jest.fn();
const mockMutateAsync = jest.fn();
const mockMutationReset = jest.fn();
const mockMutationState = { isPending: false, isError: false };
let capturedMutationOptions: any = null;

const mockInvalidateQueries = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const key = queryKey[0];
    if (key === 'activity-history') {
      return {
        data: mockHistoryState.data,
        isLoading: mockHistoryState.isLoading,
        isError: mockHistoryState.isError,
        refetch: mockHistoryRefetch,
      };
    }
    if (key === 'shifts') {
      return { data: mockShifts, isLoading: false, isError: false, refetch: jest.fn() };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
  useMutation: (options: any) => {
    capturedMutationOptions = options;
    return {
      mutate: mockMutate,
      mutateAsync: mockMutateAsync,
      isPending: mockMutationState.isPending,
      isError: mockMutationState.isError,
      reset: mockMutationReset,
    };
  },
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock('@/api/progress', () => ({
  getHistory: jest.fn(),
}));

// The screen's create-session form imports these. useMutation is stubbed, so
// neither is actually invoked — the jest.fns just satisfy the import graph.
jest.mock('@/api/training', () => ({
  getScheduledSessions: jest.fn(),
  createScheduledSession: jest.fn(),
}));

jest.mock('@/api/shifts', () => ({
  list: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

// Decorative glyphs; stub to plain text so the icon name is assertable.
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

// Native date picker → host <View>; never opened in these tests (the
// DateTimeField stub below stands in for date selection). Keeps the import
// graph resolvable if the real component is ever reached.
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: (props: Record<string, unknown>) => <View {...props} /> };
});

// The date being "picked" by the DateTimeField stub when its trigger is pressed.
const MOCK_PICKED_DATE = '2026-03-20';

// Keep the REAL Button / EmptyState / Card primitives (the "No sessions
// scheduled" EmptyState + the real Save button are asserted), but replace
// DateTimeField with a controllable stub: pressing it emits a fixed
// 'YYYY-MM-DD' via onChange so a test can satisfy the "a date is chosen" gate
// without driving the native spinner.
jest.mock('@/components/ui', () => {
  const actual = jest.requireActual('@/components/ui');
  const { Text } = require('react-native');
  return {
    ...actual,
    DateTimeField: ({ value, onChange, accessibilityLabel }: any) => (
      <Text
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? 'Select date'}
        onPress={() => onChange(MOCK_PICKED_DATE)}
      >
        {`date:${value ?? ''}`}
      </Text>
    ),
  };
});

// Import AFTER the mocks are registered.
import TrainingCalendarScreen from '../../app/(performance)/calendar';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <TrainingCalendarScreen />
    </ThemeContext.Provider>,
  );
}

describe('Training Calendar — state-driven month, ISO-date matching, honest sessions', () => {
  beforeEach(() => {
    // Freeze "today" to mid-March 2026 so the initial cursor opens on March
    // 2026 and the today-highlight is deterministic. Using LOCAL date parts in
    // the screen means the frozen instant maps to March 10 in the runner's tz
    // (noon keeps it on the 10th for any reasonable offset).
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 2, 10, 12, 0, 0)); // 2026-03-10 12:00 local
    mockHistoryState.data = [];
    mockHistoryState.isLoading = false;
    mockHistoryState.isError = false;
    mockHistoryRefetch.mockClear();
    // Reset the captured mutation wiring + spies between tests.
    mockMutate.mockClear();
    mockMutateAsync.mockClear();
    mockMutationReset.mockClear();
    mockInvalidateQueries.mockClear();
    mockMutationState.isPending = false;
    mockMutationState.isError = false;
    capturedMutationOptions = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('header month/year comes from state (not the literal "March 2026" hardcode)', () => {
    // Even with the clock frozen to March, this proves the value is rendered
    // from state because the chevron tests below change it. Here we just pin
    // the initial derived label.
    renderScreen();
    expect(screen.getByText('March 2026')).toBeTruthy();
  });

  test('chevrons change the displayed month, rolling the year over Jan → Dec', () => {
    renderScreen();
    expect(screen.getByText('March 2026')).toBeTruthy();

    // Forward to April 2026.
    fireEvent.press(screen.getByLabelText('Next month'));
    expect(screen.getByText('April 2026')).toBeTruthy();
    expect(screen.queryByText('March 2026')).toBeNull();

    // Back three months: April → March → February → January 2026.
    fireEvent.press(screen.getByLabelText('Previous month'));
    fireEvent.press(screen.getByLabelText('Previous month'));
    fireEvent.press(screen.getByLabelText('Previous month'));
    expect(screen.getByText('January 2026')).toBeTruthy();

    // One more back rolls the YEAR over to December 2025.
    fireEvent.press(screen.getByLabelText('Previous month'));
    expect(screen.getByText('December 2025')).toBeTruthy();
  });

  test('activity dot uses the FULL ISO date — the 15th lights only in the entry\'s month, not every month', () => {
    // A single history entry carrying a full ISO date on the 15th of March.
    mockHistoryState.data = [
      { date: '2026-03-15T08:30:00.000Z', score: 88, calories: 2100, hydrationMl: 2500 },
    ];

    renderScreen();

    // March 2026: the 15th IS marked (exact a11y label includes ", has activity").
    expect(screen.getByLabelText('Day 15, has activity')).toBeTruthy();
    // And it is NOT also present as a plain (no-activity) "Day 15".
    expect(screen.queryByLabelText('Day 15')).toBeNull();

    // CROSS-MONTH NEGATIVE: navigate to April 2026. The old buggy code matched
    // on getDate() only, so April 15 would ALSO light up. With full-ISO
    // matching it must NOT.
    fireEvent.press(screen.getByLabelText('Next month'));
    expect(screen.getByText('April 2026')).toBeTruthy();
    expect(screen.queryByLabelText('Day 15, has activity')).toBeNull();
    // April 15 exists as a plain cell instead.
    expect(screen.getByLabelText('Day 15')).toBeTruthy();
  });

  test('grid renders the real day count + leading weekday offset for the displayed month', () => {
    // Any non-empty history makes the grid (rather than the empty-state) render;
    // the entry's date is irrelevant to this day-count assertion.
    mockHistoryState.data = [
      { date: '2026-03-01T00:00:00.000Z', score: 50, calories: 0, hydrationMl: 0 },
    ];
    renderScreen();

    // March 2026 has 31 days; April (30) and February (28, non-leap) differ.
    // Day 31 exists in March but NOT in April.
    expect(screen.getByLabelText('Day 31')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Next month')); // April 2026 (30 days)
    expect(screen.getByText('April 2026')).toBeTruthy();
    expect(screen.queryByLabelText('Day 31')).toBeNull();
    expect(screen.getByLabelText('Day 30')).toBeTruthy();

    // Back to March, then to February 2026 (28 days, non-leap): no 29/30/31.
    fireEvent.press(screen.getByLabelText('Previous month')); // March
    fireEvent.press(screen.getByLabelText('Previous month')); // February
    expect(screen.getByText('February 2026')).toBeTruthy();
    expect(screen.getByLabelText('Day 28')).toBeTruthy();
    expect(screen.queryByLabelText('Day 29')).toBeNull();
    expect(screen.queryByLabelText('Day 30')).toBeNull();
    expect(screen.queryByLabelText('Day 31')).toBeNull();
  });

  test('today-highlight is the full-date match (the 10th of March 2026 is selected, not the 10th of other months)', () => {
    // Non-empty history so the day grid renders (empty history shows the
    // empty-state instead of cells). Use the 5th — NOT the 10th — so the
    // today cell's a11y label stays exactly "Day 10" (no ", has activity"
    // suffix) and the highlight assertion targets it cleanly.
    mockHistoryState.data = [
      { date: '2026-03-05T08:00:00.000Z', score: 70, calories: 0, hydrationMl: 0 },
    ];
    renderScreen();

    // Frozen clock → today is 2026-03-10. The cell carries accessibilityState
    // { selected: true } only on that exact date.
    const today = screen.getByLabelText('Day 10');
    expect(today.props.accessibilityState?.selected).toBe(true);

    // Navigate away: the 10th of April must NOT be selected (day-of-month would
    // have falsely highlighted it under the old code).
    fireEvent.press(screen.getByLabelText('Next month'));
    expect(screen.getByText('April 2026')).toBeTruthy();
    const aprilTenth = screen.getByLabelText('Day 10');
    expect(aprilTenth.props.accessibilityState?.selected).toBe(false);
  });

  test('"Scheduled Sessions" is an honest EmptyState — no fabricated session titles/times', () => {
    renderScreen();

    // The honest zero-data state.
    expect(screen.getByText('No sessions scheduled')).toBeTruthy();

    // The previously-hardcoded fake sessions must be gone.
    expect(screen.queryByText('Push Day - Hypertrophy')).toBeNull();
    expect(screen.queryByText('Full Body Power')).toBeNull();
    expect(screen.queryByText('Tomorrow, 08:30')).toBeNull();
    expect(screen.queryByText('Friday, 17:00')).toBeNull();
  });

  test('no dead view-switcher: the Week/Month/Year tabs stay gone, but the header "+" is now a REAL add control', () => {
    renderScreen();

    // The view switcher was a no-op: `viewMode` state was never read, so Week
    // and Year never changed the (always-monthly) grid. It must stay removed —
    // no "tab"-role controls and none of its labels survive. (The working
    // prev/next chevrons are buttons, not tabs, so they are unaffected.)
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByLabelText('Week')).toBeNull();
    expect(screen.queryByLabelText('Year')).toBeNull();
    // "Month" only ever existed as a switcher tab; the month is now shown via
    // the "<Month> <Year>" header label (e.g. "March 2026"), never a bare
    // "Month" control.
    expect(screen.queryByLabelText('Month')).toBeNull();
    expect(screen.queryByText('Week')).toBeNull();
    expect(screen.queryByText('Year')).toBeNull();

    // The header "+" is no longer a dead button — it has a real onPress that
    // opens the create-session form. The OLD bare "Add" label is gone; the
    // honest, descriptive "Add scheduled session" label is present.
    expect(screen.queryByLabelText('Add')).toBeNull();
    expect(screen.getByLabelText('Add scheduled session')).toBeTruthy();
  });

  test('the header "+" opens the create-session form (title field becomes visible)', () => {
    renderScreen();

    // Form is closed initially — the title field is not mounted.
    expect(screen.queryByLabelText('Session title')).toBeNull();

    fireEvent.press(screen.getByLabelText('Add scheduled session'));

    // Pressing the add control opens the form: its title input is now visible.
    expect(screen.getByLabelText('Session title')).toBeTruthy();
    expect(screen.getByText('New Session')).toBeTruthy();
  });

  test('Save is disabled until a title AND a date are present, then fires the mutation', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Add scheduled session'));

    const saveBtn = screen.getByLabelText('Save session');

    // Nothing entered yet → disabled, and pressing it is a no-op.
    expect(saveBtn.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(saveBtn);
    expect(mockMutate).not.toHaveBeenCalled();

    // Title alone is not enough (no date yet).
    fireEvent.changeText(screen.getByLabelText('Session title'), 'Push Day');
    expect(screen.getByLabelText('Save session').props.accessibilityState?.disabled).toBe(true);

    // Choose a date via the stubbed DateTimeField → Save enables.
    fireEvent.press(screen.getByLabelText('Session date'));
    const enabled = screen.getByLabelText('Save session');
    expect(enabled.props.accessibilityState?.disabled).toBe(false);

    // Pressing Save fires the captured mutation with a well-formed payload.
    fireEvent.press(enabled);
    expect(mockMutate).toHaveBeenCalledTimes(1);
    const payload = mockMutate.mock.calls[0][0];
    expect(payload.title).toBe('Push Day');
    expect(typeof payload.scheduledAt).toBe('string');
    // A real ISO instant assembled from the picked date + default time-of-day.
    expect(new Date(payload.scheduledAt).toISOString()).toBe(payload.scheduledAt);
    expect(payload.scheduledAt).toContain('2026-03-20');
    // "None" is the default shift selection, so shiftId is omitted entirely.
    expect('shiftId' in payload).toBe(false);
  });

  test('the captured mutationFn is createScheduledSession (the write API)', () => {
    const trainingApi = require('@/api/training');
    renderScreen();
    fireEvent.press(screen.getByLabelText('Add scheduled session'));
    expect(capturedMutationOptions).not.toBeNull();
    expect(capturedMutationOptions.mutationFn).toBe(trainingApi.createScheduledSession);
  });

  test('firing the captured onSuccess invalidates ["scheduled-sessions"] and closes the form', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Add scheduled session'));
    expect(screen.getByLabelText('Session title')).toBeTruthy();

    // Simulate a successful POST by invoking the onSuccess the screen registered.
    // Wrapped in act() because it drives setState (invalidate + close).
    act(() => capturedMutationOptions.onSuccess());

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['scheduled-sessions'] });
    // The form closed: the title field is unmounted again.
    expect(screen.queryByLabelText('Session title')).toBeNull();
  });

  test('onError classifies a 503 as "not available" and a network error as a connection problem — never a throw', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Add scheduled session'));

    // 503 → honest "not available yet" inline copy (no redbox / rethrow).
    // act() flushes the setState the onError handler performs.
    expect(() =>
      act(() => capturedMutationOptions.onError({ response: { status: 503 } })),
    ).not.toThrow();
    expect(screen.getByText(/Scheduling isn't available yet/)).toBeTruthy();

    // A generic/network error → the connection copy.
    expect(() =>
      act(() => capturedMutationOptions.onError(new Error('Network Error'))),
    ).not.toThrow();
    expect(screen.getByText(/check your connection and try again/)).toBeTruthy();
  });

  test('title and notes inputs cap length client-side at the backend bounds (200 / 2000)', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Add scheduled session'));

    const titleInput = screen.getByLabelText('Session title');
    expect(titleInput.props.maxLength).toBe(200);

    const notesInput = screen.getByLabelText('Session notes');
    expect(notesInput.props.maxLength).toBe(2000);
  });

  test('the optional shift picker lists the user\'s shifts plus a default "None"', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Add scheduled session'));

    // "None" is always present and selected by default.
    const none = screen.getByLabelText('No linked shift');
    expect(none.props.accessibilityState?.selected).toBe(true);

    // The single mocked shift renders as a selectable option.
    expect(screen.getByLabelText(/Link shift FIXED_NIGHT/)).toBeTruthy();
  });

  test('error state still renders the activity EmptyState with a working Retry', () => {
    mockHistoryState.isError = true;
    renderScreen();

    expect(screen.getByText("Couldn't load activity")).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(mockHistoryRefetch).toHaveBeenCalledTimes(1);
  });

  test('empty history (no activity) renders the grid empty-state', () => {
    mockHistoryState.data = [];
    renderScreen();
    expect(screen.getByText('No activity logged this month')).toBeTruthy();
  });
});
