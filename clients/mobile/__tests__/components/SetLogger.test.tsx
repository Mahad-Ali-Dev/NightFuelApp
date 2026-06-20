/**
 * Render + interaction tests for the workout SetLogger
 * (`src/components/workout/SetLogger.tsx`), the live set-entry card consumed by
 * the routed `app/training/workout.tsx`.
 *
 * Focus: input hardening. `handleLog` parses the two text inputs with
 * parseInt(reps,10) / parseFloat(weight) and must REJECT junk before anything
 * reaches `onLogSet` or the visible loggedSets list:
 *   - non-numeric ('abc' → NaN)
 *   - non-positive reps ('0', '-3')
 *   - negative weight
 * A valid entry (reps >= 1, weight >= 0 — bodyweight 0kg is allowed) appends one
 * "Set N" row, calls onLogSet exactly once with the parsed numbers, and clears
 * both inputs. An invalid attempt is a no-op that leaves the typed text intact.
 *
 * We also assert the two inputs and the log button are reachable via their new
 * accessibility labels / role.
 *
 * Mocks: only `@expo/vector-icons` (Ionicons → plain Text) so the module graph
 * loads without expo-font/expo-asset. SetLogger reads the static `@/theme`
 * `colors` export directly (no useTheme / ThemeContext), so no theme provider
 * wrapper is needed. No network or native side effects exist in this component.
 */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';

// Decorative glyphs; stub to plain text (avoids expo-font → expo-asset),
// matching the sibling component suites.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// Import AFTER the mock is registered.
import { SetLogger } from '@/components/workout/SetLogger';

/** Type a value into a labelled input via its onChangeText. */
function type(label: string, value: string) {
  fireEvent.changeText(screen.getByLabelText(label), value);
}

/** Press the accessible "Log set" button. */
function pressLog() {
  fireEvent.press(screen.getByRole('button', { name: 'Log set' }));
}

describe('SetLogger — input hardening', () => {
  test('valid entry: calls onLogSet once with parsed numbers and renders a "Set 1" row', () => {
    const onLogSet = jest.fn();
    render(<SetLogger exerciseName="Bench Press" targetSets={3} onLogSet={onLogSet} />);

    type('Reps', '10');
    type('Weight in kilograms', '40');
    pressLog();

    expect(onLogSet).toHaveBeenCalledTimes(1);
    expect(onLogSet).toHaveBeenCalledWith({ reps: 10, weightKg: 40 });
    // The logged row renders with its "Set 1" label and the parsed values.
    expect(screen.getByText('Set 1')).toBeTruthy();
    expect(screen.getByText('10 reps')).toBeTruthy();
    expect(screen.getByText('40 kg')).toBeTruthy();
  });

  test('bodyweight (0kg) is a valid weight', () => {
    const onLogSet = jest.fn();
    render(<SetLogger exerciseName="Pull Up" targetSets={3} onLogSet={onLogSet} />);

    type('Reps', '8');
    type('Weight in kilograms', '0');
    pressLog();

    expect(onLogSet).toHaveBeenCalledTimes(1);
    expect(onLogSet).toHaveBeenCalledWith({ reps: 8, weightKg: 0 });
    expect(screen.getByText('Set 1')).toBeTruthy();
  });

  // Non-numeric reps, zero reps, and negative reps are each rejected.
  test.each(['abc', '0', '-3'])(
    'rejects reps="%s": no onLogSet call, no logged row',
    (badReps) => {
      const onLogSet = jest.fn();
      render(<SetLogger exerciseName="Squat" targetSets={3} onLogSet={onLogSet} />);

      type('Reps', badReps);
      type('Weight in kilograms', '40');
      pressLog();

      expect(onLogSet).not.toHaveBeenCalled();
      expect(screen.queryByText('Set 1')).toBeNull();
    },
  );

  test('rejects a negative weight', () => {
    const onLogSet = jest.fn();
    render(<SetLogger exerciseName="Deadlift" targetSets={3} onLogSet={onLogSet} />);

    type('Reps', '5');
    type('Weight in kilograms', '-20');
    pressLog();

    expect(onLogSet).not.toHaveBeenCalled();
    expect(screen.queryByText('Set 1')).toBeNull();
  });

  test('a valid log clears both inputs', () => {
    render(<SetLogger exerciseName="Row" targetSets={3} onLogSet={jest.fn()} />);

    type('Reps', '12');
    type('Weight in kilograms', '30');
    pressLog();

    expect(screen.getByLabelText('Reps').props.value).toBe('');
    expect(screen.getByLabelText('Weight in kilograms').props.value).toBe('');
  });

  test('an invalid attempt leaves both inputs intact', () => {
    render(<SetLogger exerciseName="Curl" targetSets={3} onLogSet={jest.fn()} />);

    type('Reps', 'abc');
    type('Weight in kilograms', '40');
    pressLog();

    // Nothing was logged, so the typed text must remain for the user to fix.
    expect(screen.getByLabelText('Reps').props.value).toBe('abc');
    expect(screen.getByLabelText('Weight in kilograms').props.value).toBe('40');
  });
});

describe('SetLogger — accessibility', () => {
  test('the two inputs and the log button are queryable by role/label', () => {
    render(<SetLogger exerciseName="Press" targetSets={3} onLogSet={jest.fn()} />);

    expect(screen.getByLabelText('Reps')).toBeTruthy();
    expect(screen.getByLabelText('Weight in kilograms')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log set' })).toBeTruthy();
  });
});
