/**
 * Behaviour tests for the workout <RestTimer /> countdown ring.
 *
 * RestTimer is a self-contained, clock-free countdown: the parent drives it
 * purely via two props — `durationSeconds` (the rest length) and `isRunning`
 * (play/pause) — and it decrements one whole second per `setInterval` tick,
 * calling `onFinish` once when it reaches zero. There is no `Date.now()` in the
 * component, so jest fake timers fully control time here.
 *
 * Coverage (mirrors the acceptance criteria):
 *   1. running with duration=3, advancing 3s drives the countdown to 00:00 and
 *      fires onFinish EXACTLY once (the clear-before-onFinish guard).
 *   2. toggling isRunning false→true after a pause RESUMES the countdown — the
 *      previously-broken resume path (effect now re-runs on the relevant change).
 *   3. unmounting tears the interval down with no leaked timer (no act warning,
 *      and a later time-advance must not call onFinish).
 *   4. the timer container exposes an accessibility label derived from the
 *      remaining time.
 *
 * react-native-svg is in jest-expo's transform whitelist, so the ring renders
 * to host primitives without a stub. We never assert on the SVG (decorative);
 * assertions ride on the rendered MM:SS text and the a11y label.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react-native';

import { RestTimer, formatRestA11yLabel } from '@/components/workout/RestTimer';

/** Advance N whole seconds inside act() so state settles with no warnings. */
function tickSeconds(n: number) {
  act(() => {
    jest.advanceTimersByTime(n * 1000);
  });
}

/** The rendered MM:SS clock text (mirrors what a sighted user sees). */
function clockText(): string {
  // The time + "REST" label are the only two <Text> nodes; the MM:SS one
  // matches the digit pattern.
  return screen.getByText(/^\d{2}:\d{2}$/).props.children.join('');
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('formatRestA11yLabel (pure)', () => {
  test('formats minutes + seconds, singular/plural, and the finished state', () => {
    expect(formatRestA11yLabel(90)).toBe('Rest timer, 1 minute 30 seconds remaining');
    expect(formatRestA11yLabel(61)).toBe('Rest timer, 1 minute 1 second remaining');
    expect(formatRestA11yLabel(120)).toBe('Rest timer, 2 minutes remaining');
    expect(formatRestA11yLabel(45)).toBe('Rest timer, 45 seconds remaining');
    expect(formatRestA11yLabel(1)).toBe('Rest timer, 1 second remaining');
    expect(formatRestA11yLabel(0)).toBe('Rest timer, finished');
  });
});

describe('RestTimer', () => {
  test('running with duration=3: advancing 3s reaches 00:00 and fires onFinish exactly once', () => {
    const onFinish = jest.fn();
    render(<RestTimer durationSeconds={3} isRunning onFinish={onFinish} />);

    expect(clockText()).toBe('00:03');

    tickSeconds(1);
    expect(clockText()).toBe('00:02');
    tickSeconds(1);
    expect(clockText()).toBe('00:01');
    expect(onFinish).not.toHaveBeenCalled();

    // The tick that crosses zero fires onFinish and clears the interval.
    tickSeconds(1);
    expect(clockText()).toBe('00:00');
    expect(onFinish).toHaveBeenCalledTimes(1);

    // Further advancing must NOT re-enter and fire a second onFinish — the
    // interval was cleared BEFORE onFinish, and remaining=0 won't restart it.
    tickSeconds(5);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(clockText()).toBe('00:00');
  });

  test('does not tick while paused (isRunning=false)', () => {
    render(<RestTimer durationSeconds={30} isRunning={false} />);
    expect(clockText()).toBe('00:30');
    tickSeconds(5);
    // No interval is armed while paused, so the clock is unchanged.
    expect(clockText()).toBe('00:30');
  });

  test('toggling isRunning false→true after a pause RESUMES the countdown', () => {
    const onFinish = jest.fn();
    const { rerender } = render(
      <RestTimer durationSeconds={10} isRunning onFinish={onFinish} />,
    );
    expect(clockText()).toBe('00:10');

    // Run for 3s → 00:07.
    tickSeconds(3);
    expect(clockText()).toBe('00:07');

    // Pause: flip isRunning false. Advancing time must NOT decrement.
    rerender(<RestTimer durationSeconds={10} isRunning={false} onFinish={onFinish} />);
    tickSeconds(4);
    expect(clockText()).toBe('00:07');

    // Resume: flip isRunning back true. This is the previously-broken path —
    // the effect must re-arm the interval and the countdown must continue from
    // where it paused (07 → 04 after 3s), NOT stay frozen.
    rerender(<RestTimer durationSeconds={10} isRunning onFinish={onFinish} />);
    tickSeconds(3);
    expect(clockText()).toBe('00:04');

    // And it still finishes correctly, exactly once.
    tickSeconds(4);
    expect(clockText()).toBe('00:00');
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  test('unmounting clears the interval (no leaked timer / no further onFinish)', () => {
    const onFinish = jest.fn();
    const { unmount } = render(
      <RestTimer durationSeconds={5} isRunning onFinish={onFinish} />,
    );

    tickSeconds(1); // 00:04, interval live

    act(() => {
      unmount();
    });

    // No timers should remain queued by this component.
    expect(jest.getTimerCount()).toBe(0);

    // Advancing after unmount must not fire onFinish (interval was cleared).
    tickSeconds(10);
    expect(onFinish).not.toHaveBeenCalled();
  });

  test('exposes an accessibility label reflecting the remaining time', () => {
    render(<RestTimer durationSeconds={90} isRunning={false} />);

    // role="timer" container carries the derived label.
    const timer = screen.getByRole('timer');
    expect(timer.props.accessibilityLabel).toBe('Rest timer, 1 minute 30 seconds remaining');

    // Queryable by accessible name as well.
    expect(
      screen.getByLabelText('Rest timer, 1 minute 30 seconds remaining'),
    ).toBeTruthy();
  });

  test('the accessibility label updates as the countdown advances', () => {
    render(<RestTimer durationSeconds={62} isRunning />);
    expect(screen.getByRole('timer').props.accessibilityLabel).toBe(
      'Rest timer, 1 minute 2 seconds remaining',
    );

    tickSeconds(2); // → 60s remaining
    expect(screen.getByRole('timer').props.accessibilityLabel).toBe(
      'Rest timer, 1 minute remaining',
    );

    tickSeconds(60); // → 0
    expect(screen.getByRole('timer').props.accessibilityLabel).toBe('Rest timer, finished');
  });

  test('resets the countdown when durationSeconds prop changes', () => {
    const { rerender } = render(<RestTimer durationSeconds={20} isRunning={false} />);
    expect(clockText()).toBe('00:20');

    rerender(<RestTimer durationSeconds={45} isRunning={false} />);
    expect(clockText()).toBe('00:45');
  });
});
