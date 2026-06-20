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

/**
 * The STRICT-UPGRADE affordances — opt-in via `allowEdit` / `allowAddRemove`
 * (the routed workout screen passes both; the modal keeps the read-only default
 * covered by the suites above). Each path — initial log, in-row edit, add —
 * still flows through the SAME finite + reps>=1 / weight>=0 guard.
 */
describe('SetLogger — STRICT-UPGRADE affordances (allowEdit + allowAddRemove)', () => {
  function renderUpgraded(extra?: Partial<React.ComponentProps<typeof SetLogger>>) {
    const onLogSet = jest.fn();
    render(
      <SetLogger
        exerciseName="Bench Press"
        targetSets={3}
        onLogSet={onLogSet}
        allowEdit
        allowAddRemove
        {...extra}
      />,
    );
    return { onLogSet };
  }

  // (a) per-set DONE control is a Pressable queryable by role=button +
  //     accessibilityState; pressing it toggles `completed`.
  test('a logged set exposes a DONE Pressable (role=button) whose accessibilityState toggles', () => {
    renderUpgraded();

    // Log one set so a logged row (with its DONE control) exists.
    type('Reps', '10');
    type('Weight in kilograms', '40');
    pressLog();

    const done = screen.getByRole('button', { name: 'Mark set 1 done' });
    // Seeded/just-logged set starts completed.
    expect(done.props.accessibilityState.selected).toBe(true);

    // Toggle it off, then on again — the flag follows the press.
    fireEvent.press(done);
    expect(screen.getByRole('button', { name: 'Mark set 1 done' }).props.accessibilityState.selected).toBe(false);
    fireEvent.press(done);
    expect(screen.getByRole('button', { name: 'Mark set 1 done' }).props.accessibilityState.selected).toBe(true);
  });

  // The displayed N / M count derives from the completed flags (state-ground-
  // truth): toggling a logged set off drops the count.
  test('the displayed count derives from the completed flags', () => {
    renderUpgraded();

    type('Reps', '10');
    type('Weight in kilograms', '40');
    pressLog();
    expect(screen.getByText('1 / 3 sets')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Mark set 1 done' }));
    expect(screen.getByText('0 / 3 sets')).toBeTruthy();
  });

  // (b) an already-logged set's KG and REPS edit in place and re-commit through
  //     the guard, updating the displayed value.
  test('an already-logged set edits KG / REPS in place through the guard', () => {
    renderUpgraded();

    type('Reps', '10');
    type('Weight in kilograms', '40');
    pressLog();

    const repsInput = screen.getByLabelText('Reps for set 1');
    const weightInput = screen.getByLabelText('Weight in kilograms for set 1');
    expect(repsInput.props.value).toBe('10');
    expect(weightInput.props.value).toBe('40');

    // A valid edit re-commits and updates the displayed value.
    fireEvent.changeText(repsInput, '12');
    fireEvent.changeText(weightInput, '45');
    expect(screen.getByLabelText('Reps for set 1').props.value).toBe('12');
    expect(screen.getByLabelText('Weight in kilograms for set 1').props.value).toBe('45');
  });

  // (d) the in-row edit path rejects junk: the row value is left untouched.
  test.each(['abc', '0', '-3'])(
    'in-row edit rejects reps="%s": the row value is unchanged',
    (badReps) => {
      renderUpgraded();

      type('Reps', '10');
      type('Weight in kilograms', '40');
      pressLog();

      fireEvent.changeText(screen.getByLabelText('Reps for set 1'), badReps);
      // Junk rejected by the guard → the committed value snaps back to 10.
      expect(screen.getByLabelText('Reps for set 1').props.value).toBe('10');
    },
  );

  test('in-row edit rejects a negative weight: the row value is unchanged', () => {
    renderUpgraded();

    type('Reps', '10');
    type('Weight in kilograms', '40');
    pressLog();

    fireEvent.changeText(screen.getByLabelText('Weight in kilograms for set 1'), '-20');
    expect(screen.getByLabelText('Weight in kilograms for set 1').props.value).toBe('40');
  });

  // (c) ADD adds an editable row (the guarded input-row "Log set" is the add
  //     path; allowAddRemove keeps it visible past target), REMOVE removes one.
  test('add appends an editable row and remove deletes one', () => {
    renderUpgraded();

    // Add set 1.
    type('Reps', '10');
    type('Weight in kilograms', '40');
    pressLog();
    expect(screen.getByText('Set 1')).toBeTruthy();
    expect(screen.getByLabelText('Reps for set 1')).toBeTruthy();

    // Add set 2.
    type('Reps', '8');
    type('Weight in kilograms', '42');
    pressLog();
    expect(screen.getByText('Set 2')).toBeTruthy();

    // Remove set 1 → the remaining row re-numbers to "Set 1" and there is no
    // longer a "Set 2".
    fireEvent.press(screen.getByRole('button', { name: 'Remove set 1' }));
    expect(screen.getByText('Set 1')).toBeTruthy();
    expect(screen.queryByText('Set 2')).toBeNull();
  });

  // (d) the add path rejects junk: no onLogSet, no row.
  test.each(['abc', '0', '-3'])(
    'add rejects reps="%s": no onLogSet call, no logged row',
    (badReps) => {
      const { onLogSet } = renderUpgraded();

      type('Reps', badReps);
      type('Weight in kilograms', '40');
      pressLog();

      expect(onLogSet).not.toHaveBeenCalled();
      expect(screen.queryByText('Set 1')).toBeNull();
    },
  );

  // (e) seeding with initialSets opens at N / M with NO onLogSet, and later edits
  //     are not reset by a re-render (lazy one-time seed).
  test('initialSets of 2 completed + targetSets=3 shows "2 / 3" with no onLogSet, and edits persist', () => {
    const onLogSet = jest.fn();
    const { rerender } = render(
      <SetLogger
        exerciseName="Squat"
        targetSets={3}
        onLogSet={onLogSet}
        allowEdit
        allowAddRemove
        initialSets={[
          { reps: 8, weightKg: 60, completed: true },
          { reps: 8, weightKg: 60, completed: true },
        ]}
      />,
    );

    // Opens at 2 / 3 (not 0 / 3) and the seed did NOT fire onLogSet.
    expect(screen.getByText('2 / 3 sets')).toBeTruthy();
    expect(onLogSet).not.toHaveBeenCalled();

    // Edit set 1's reps, then force a parent re-render with the SAME initialSets:
    // the lazy seed must NOT re-run and clobber the edit.
    fireEvent.changeText(screen.getByLabelText('Reps for set 1'), '12');
    expect(screen.getByLabelText('Reps for set 1').props.value).toBe('12');

    rerender(
      <SetLogger
        exerciseName="Squat"
        targetSets={3}
        onLogSet={onLogSet}
        allowEdit
        allowAddRemove
        initialSets={[
          { reps: 8, weightKg: 60, completed: true },
          { reps: 8, weightKg: 60, completed: true },
        ]}
      />,
    );

    // The edited value survives the re-render (seed is one-time).
    expect(screen.getByLabelText('Reps for set 1').props.value).toBe('12');
  });
});

/**
 * PARENT-PERSIST callbacks — the additive `onToggleDone` / `onEditSet` /
 * `onRemoveSet` notifications that mirror each in-row mutation to the OWNER's set
 * model (closing the former display-only divergence). They default undefined (so
 * the read-only modal usage is unaffected) and fire AFTER the matching local
 * mutation, keyed by the row index. Critically, `onEditSet` fires ONLY for a
 * value that passed the SAME `validateSet` guard — never on junk — so the single
 * numeric entry point is preserved for both the add path and the in-row edit.
 *
 * We SEED via `initialSets` so the rows exist deterministically and the row index
 * maps 1:1 to the index handed back to the parent (exactly how the routed workout
 * screen seeds from ALL planned sets).
 */
describe('SetLogger — parent-persist callbacks (onToggleDone / onEditSet / onRemoveSet)', () => {
  function renderWithCallbacks(
    cbs: Partial<
      Pick<React.ComponentProps<typeof SetLogger>, 'onToggleDone' | 'onEditSet' | 'onRemoveSet' | 'onLogSet'>
    >,
  ) {
    const onLogSet = cbs.onLogSet ?? jest.fn();
    render(
      <SetLogger
        exerciseName="Bench Press"
        targetSets={3}
        onLogSet={onLogSet}
        allowEdit
        allowAddRemove
        // Two seeded rows: set 1 completed, set 2 completed → indices 0 and 1.
        initialSets={[
          { reps: 8, weightKg: 60, completed: true },
          { reps: 10, weightKg: 50, completed: true },
        ]}
        onToggleDone={cbs.onToggleDone}
        onEditSet={cbs.onEditSet}
        onRemoveSet={cbs.onRemoveSet}
      />,
    );
    return { onLogSet };
  }

  test('toggling a set fires onToggleDone with that row index', () => {
    const onToggleDone = jest.fn();
    renderWithCallbacks({ onToggleDone });

    // Toggle the SECOND seeded row → index 1 (0-based) reaches the parent.
    fireEvent.press(screen.getByRole('button', { name: 'Mark set 2 done' }));
    expect(onToggleDone).toHaveBeenCalledTimes(1);
    expect(onToggleDone).toHaveBeenCalledWith(1);

    // Toggle the first row too → index 0.
    fireEvent.press(screen.getByRole('button', { name: 'Mark set 1 done' }));
    expect(onToggleDone).toHaveBeenCalledTimes(2);
    expect(onToggleDone).toHaveBeenLastCalledWith(0);
  });

  test('a VALID in-row edit fires onEditSet with the index and parsed value (reps and kg)', () => {
    const onEditSet = jest.fn();
    const onLogSet = jest.fn();
    renderWithCallbacks({ onEditSet, onLogSet });

    // Edit set 1's reps 8 → 12: onEditSet fires with the row's CURRENT weight (60).
    fireEvent.changeText(screen.getByLabelText('Reps for set 1'), '12');
    expect(onEditSet).toHaveBeenCalledTimes(1);
    expect(onEditSet).toHaveBeenLastCalledWith(0, { reps: 12, weightKg: 60 });

    // Edit set 2's weight 50 → 55: index 1, reps stays its current 10.
    fireEvent.changeText(screen.getByLabelText('Weight in kilograms for set 2'), '55');
    expect(onEditSet).toHaveBeenCalledTimes(2);
    expect(onEditSet).toHaveBeenLastCalledWith(1, { reps: 10, weightKg: 55 });

    // An edit is NOT an add — onLogSet never fires from the edit path.
    expect(onLogSet).not.toHaveBeenCalled();
  });

  // Junk in the in-row edit fires NEITHER onEditSet NOR onLogSet (validateSet is
  // the single numeric entry point; junk → no parent mutation at all).
  test.each(['abc', '0', '-3'])(
    'junk in-row reps="%s" fires neither onEditSet nor onLogSet',
    (badReps) => {
      const onEditSet = jest.fn();
      const onLogSet = jest.fn();
      renderWithCallbacks({ onEditSet, onLogSet });

      fireEvent.changeText(screen.getByLabelText('Reps for set 1'), badReps);
      expect(onEditSet).not.toHaveBeenCalled();
      expect(onLogSet).not.toHaveBeenCalled();
    },
  );

  test('a negative in-row weight fires neither onEditSet nor onLogSet', () => {
    const onEditSet = jest.fn();
    const onLogSet = jest.fn();
    renderWithCallbacks({ onEditSet, onLogSet });

    fireEvent.changeText(screen.getByLabelText('Weight in kilograms for set 1'), '-20');
    expect(onEditSet).not.toHaveBeenCalled();
    expect(onLogSet).not.toHaveBeenCalled();
  });

  test('removing a set fires onRemoveSet with that row index', () => {
    const onRemoveSet = jest.fn();
    renderWithCallbacks({ onRemoveSet });

    // Remove the SECOND seeded row → index 1 reaches the parent.
    fireEvent.press(screen.getByRole('button', { name: 'Remove set 2' }));
    expect(onRemoveSet).toHaveBeenCalledTimes(1);
    expect(onRemoveSet).toHaveBeenCalledWith(1);
  });

  test('the callbacks are OPTIONAL: in-row mutations are local no-ops when none are passed', () => {
    // No callbacks passed (the modal default). The local mutations must still
    // work without throwing — proving the callbacks are guarded with `?.`.
    render(
      <SetLogger
        exerciseName="Squat"
        targetSets={3}
        onLogSet={jest.fn()}
        allowEdit
        allowAddRemove
        initialSets={[{ reps: 8, weightKg: 60, completed: true }]}
      />,
    );

    expect(() => {
      fireEvent.press(screen.getByRole('button', { name: 'Mark set 1 done' }));
      fireEvent.changeText(screen.getByLabelText('Reps for set 1'), '9');
      fireEvent.press(screen.getByRole('button', { name: 'Remove set 1' }));
    }).not.toThrow();
    // The set was removed locally (no row remains).
    expect(screen.queryByText('Set 1')).toBeNull();
  });
});
