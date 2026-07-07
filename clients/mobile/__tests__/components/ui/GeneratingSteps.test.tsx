/**
 * Render + timing tests for the GeneratingSteps progress indicator.
 *
 * GeneratingSteps cycles through status lines on a setInterval while `active`,
 * holding on the final line until generation settles, and renders nothing when
 * inactive or given no steps. We drive the interval with jest fake timers and
 * wrap clock advances in act() so the internal useState re-renders flush.
 *
 * Behaviors pinned down:
 *   - null render when inactive or steps empty,
 *   - first step + spinner shown on activation,
 *   - index advances one step per `intervalMs`, then clamps at the last step,
 *   - custom intervalMs is honored,
 *   - progress dots appear only for multi-step sequences,
 *   - flipping active off resets back to the first step.
 *
 * The ActivityIndicator is part of RN core; jest-expo provides it.
 */
import React from 'react';
import { ActivityIndicator } from 'react-native';
import { render, screen, act } from '@testing-library/react-native';
import { ThemeContext, getThemeColors, typography, spacing, borderRadius, shadows } from '@/theme';
import { GeneratingSteps } from '@/components/ui/GeneratingSteps';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

const STEPS = ['Reading profile', 'Crunching numbers', 'Finalizing plan'];

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('GeneratingSteps', () => {
  test('renders nothing when inactive', () => {
    renderWithTheme(<GeneratingSteps active={false} steps={STEPS} />);
    expect(screen.toJSON()).toBeNull();
  });

  test('renders nothing when active but given no steps', () => {
    renderWithTheme(<GeneratingSteps active steps={[]} />);
    expect(screen.toJSON()).toBeNull();
  });

  test('shows the first step and a spinner when activated', () => {
    renderWithTheme(<GeneratingSteps active steps={STEPS} />);
    expect(screen.getByText('Reading profile')).toBeTruthy();
    expect(screen.UNSAFE_getAllByType(ActivityIndicator)).toHaveLength(1);
  });

  test('advances one step per interval (default 2500ms)', () => {
    renderWithTheme(<GeneratingSteps active steps={STEPS} />);
    expect(screen.getByText('Reading profile')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(screen.getByText('Crunching numbers')).toBeTruthy();
    expect(screen.queryByText('Reading profile')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(screen.getByText('Finalizing plan')).toBeTruthy();
  });

  test('holds on the final step and never advances past it', () => {
    renderWithTheme(<GeneratingSteps active steps={STEPS} />);

    // Blow well past the end of the sequence.
    act(() => {
      jest.advanceTimersByTime(2500 * 10);
    });

    expect(screen.getByText('Finalizing plan')).toBeTruthy();
    expect(screen.queryByText('Crunching numbers')).toBeNull();
  });

  test('honors a custom intervalMs', () => {
    renderWithTheme(<GeneratingSteps active steps={STEPS} intervalMs={1000} />);
    expect(screen.getByText('Reading profile')).toBeTruthy();

    // Not enough time at the custom cadence yet.
    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(screen.getByText('Reading profile')).toBeTruthy();

    // Crossing 1000ms advances exactly one step.
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByText('Crunching numbers')).toBeTruthy();
  });

  test('renders progress dots for a multi-step sequence', () => {
    const { UNSAFE_getAllByType } = renderWithTheme(<GeneratingSteps active steps={STEPS} />);
    // dots are leaf Views with a fixed height of 6; there is one per step.
    const View = require('react-native').View;
    const dotCount = UNSAFE_getAllByType(View).filter((v: { props: { style?: unknown } }) => {
      const s = Array.isArray(v.props.style)
        ? Object.assign({}, ...v.props.style.filter(Boolean))
        : v.props.style ?? {};
      return s.height === 6 && s.borderRadius === 3;
    }).length;
    expect(dotCount).toBe(STEPS.length);
  });

  test('does not render dots for a single-step sequence', () => {
    const { UNSAFE_getAllByType } = renderWithTheme(
      <GeneratingSteps active steps={['Only step']} />,
    );
    const View = require('react-native').View;
    const dotCount = UNSAFE_getAllByType(View).filter((v: { props: { style?: unknown } }) => {
      const s = Array.isArray(v.props.style)
        ? Object.assign({}, ...v.props.style.filter(Boolean))
        : v.props.style ?? {};
      return s.height === 6 && s.borderRadius === 3;
    }).length;
    expect(dotCount).toBe(0);
    // The single step itself is still shown.
    expect(screen.getByText('Only step')).toBeTruthy();
  });

  test('can hide dots via showDots={false} even with multiple steps', () => {
    const { UNSAFE_getAllByType } = renderWithTheme(
      <GeneratingSteps active steps={STEPS} showDots={false} />,
    );
    const View = require('react-native').View;
    const dotCount = UNSAFE_getAllByType(View).filter((v: { props: { style?: unknown } }) => {
      const s = Array.isArray(v.props.style)
        ? Object.assign({}, ...v.props.style.filter(Boolean))
        : v.props.style ?? {};
      return s.height === 6 && s.borderRadius === 3;
    }).length;
    expect(dotCount).toBe(0);
  });

  test('resets to the first step when active flips off then on', () => {
    const { rerender } = renderWithTheme(<GeneratingSteps active steps={STEPS} />);

    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(screen.getByText('Crunching numbers')).toBeTruthy();

    // Turn off — component unmounts its output (renders null).
    act(() => {
      rerender(
        <ThemeContext.Provider
          value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
        >
          <GeneratingSteps active={false} steps={STEPS} />
        </ThemeContext.Provider>,
      );
    });
    expect(screen.toJSON()).toBeNull();

    // Turn back on — sequence restarts from the first line.
    act(() => {
      rerender(
        <ThemeContext.Provider
          value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
        >
          <GeneratingSteps active steps={STEPS} />
        </ThemeContext.Provider>,
      );
    });
    expect(screen.getByText('Reading profile')).toBeTruthy();
  });
});
