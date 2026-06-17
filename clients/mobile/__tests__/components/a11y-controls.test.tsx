/**
 * Accessibility GUARD test for the shared logging controls.
 *
 * This file is a deliberate "lock" on the screen-reader contract of the two
 * shared inputs used across the night-shift logging flows — DateTimeField and
 * ExerciseDemo — plus the hand-rolled inputs/buttons on the log-shift and
 * log-sleep modals. Each assertion is written so that REMOVING the relevant
 * accessibility prop (role / label / hint) turns the test RED. That is the
 * whole point: it stops a future refactor from silently dropping a label and
 * leaving a control unannounced to VoiceOver / TalkBack.
 *
 * Two complementary strategies are used:
 *
 *  1. Render-level assertions (DateTimeField, ExerciseDemo) — the components
 *     import cleanly under the `@/` alias and render with light, established
 *     mocks (the native picker, expo-image, @expo/vector-icons), so we mount
 *     them and read the live a11y props off the rendered nodes.
 *
 *  2. Source-level assertions (log-shift, log-sleep) — these screens live under
 *     `app/(modals)/` (outside the `@/` → src alias) and pull in expo-router,
 *     react-query and the axios API layer, which would need heavy mocking to
 *     render. Rendering them is out of scope here; instead we read the screen
 *     source and assert the specific accessibility props are present on the
 *     controls this item is responsible for. Deleting `accessibilityLabel="…"`
 *     from any audited control fails the matching assertion.
 *
 * active-workout.tsx is intentionally NOT covered here — its accessibility is
 * owned by a separate work-item.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

// ── Mocks (mirror DateTimeField.test.tsx / ExerciseDemo.test.tsx) ───────────────

// Native date/time picker → a host <View>. We never open it here (the guard is
// about the trigger's a11y props, not the picker), but the stub keeps the
// component importable without the native module.
jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: (props: Record<string, unknown>) => <View {...props} /> };
});

// expo-image → passthrough host <View> so ExerciseDemo's frames mount and keep
// their accessibility props readable.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View testID="exercise-demo-image" {...props} /> };
});

// Decorative glyphs only.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

import { DateTimeField } from '@/components/ui/DateTimeField';
import { ExerciseDemo } from '@/components/exercise/ExerciseDemo';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

const FALLBACK = { testUri: 'bundled-fallback' };
const IMAGE_URL = 'https://cdn.example.com/exercise-hero.jpg';
const FRAME_A = 'https://cdn.example.com/frame-a.png';
const FRAME_B = 'https://cdn.example.com/frame-b.png';
const TUTORIAL_URL = 'https://youtube.com/watch?v=demo';

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

// ── Logging screens: source-level guard on the audited controls ─────────────────
// These screens are not rendered here (heavy expo-router/react-query/axios deps);
// we instead lock the accessibility props onto the specific controls this item
// audited. Each `expect(...).toContain(...)` goes red if that prop is deleted.

const MOBILE_ROOT = path.resolve(__dirname, '..', '..');
const readScreen = (rel: string) => fs.readFileSync(path.join(MOBILE_ROOT, rel), 'utf8');

describe('a11y guard — log-shift screen controls (source)', () => {
  const src = readScreen('app/(modals)/log-shift.tsx');

  test('the close button is labelled', () => {
    expect(src).toContain('accessibilityLabel="Close"');
  });

  test('the save button announces its label + state', () => {
    expect(src).toContain("accessibilityLabel={mutation.isPending ? 'Saving shift' : 'Save shift'}");
  });

  test('the shift-type chips are buttons labelled by their type', () => {
    expect(src).toContain('accessibilityRole="button"');
    expect(src).toContain('accessibilityLabel={type.label}');
    expect(src).toContain('accessibilityState={{ selected }}');
  });

  test('the rest-day Switch is labelled and exposes its checked state', () => {
    expect(src).toContain('accessibilityLabel="Rest day (day off)"');
    expect(src).toContain('accessibilityRole="switch"');
    expect(src).toContain('accessibilityState={{ checked: isDayOff }}');
  });

  test('the commute-minutes numeric input is labelled', () => {
    expect(src).toContain('accessibilityLabel="Commute time in minutes"');
  });
});

describe('a11y guard — log-sleep screen controls (source)', () => {
  const src = readScreen('app/(modals)/log-sleep.tsx');

  test('the close button is labelled', () => {
    expect(src).toContain('accessibilityLabel="Close"');
  });

  test('the "log new sleep" entry button is labelled', () => {
    expect(src).toContain('accessibilityLabel="Log new sleep"');
  });

  test('the save button announces its label + state', () => {
    expect(src).toContain(
      "accessibilityLabel={mutation.isPending ? 'Saving recovery data' : 'Save recovery data'}",
    );
  });

  test('the sleep-quality rating buttons are labelled with their value', () => {
    expect(src).toContain('accessibilityLabel={`Sleep quality ${num} out of 10`}');
    expect(src).toContain('accessibilityState={{ selected: quality === num }}');
  });

  test('the disturbance steppers are labelled', () => {
    expect(src).toContain('accessibilityLabel="Decrease"');
    expect(src).toContain('accessibilityLabel="Add"');
  });

  test('the recovery-notes input is labelled', () => {
    expect(src).toContain('accessibilityLabel="Recovery notes"');
  });

  test('the DateTimeFields pass an explicit value-bearing accessibilityLabel', () => {
    expect(src).toContain('accessibilityLabel={`Select sleep start date');
    expect(src).toContain('accessibilityLabel={`Select sleep end time');
  });
});
