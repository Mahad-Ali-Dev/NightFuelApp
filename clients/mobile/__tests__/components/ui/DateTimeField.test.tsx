/**
 * Render + interaction tests for the DateTimeField UI primitive.
 *
 * DateTimeField wraps @react-native-community/datetimepicker and is the only
 * date/time entry surface for the log-shift and log-sleep modals. The contract
 * that matters is the EXACT emitted string:
 *
 *   - mode="date" → 'YYYY-MM-DD'
 *   - mode="time" → 'HH:MM' (24h, no seconds, no timezone)
 *
 * We assert:
 *   - the visible label + current value render,
 *   - the native picker is NOT mounted until the trigger is pressed,
 *   - a simulated picker 'set' event calls onChange with a correctly-formatted
 *     date / time string,
 *   - a 'dismissed' event leaves onChange untouched,
 *   - the optional "Now" affordance fires onNow.
 *
 * The native picker is mocked to a host <View> that captures its `onChange`
 * prop into a module-level holder, so the test can invoke it with an arbitrary
 * Date the way the OS would. @expo/vector-icons is stubbed to a text glyph,
 * matching the rest of the suite.
 */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

// Capture the latest onChange handed to the native picker so a test can drive
// it with a specific Date, plus the most recent props for spot-checks.
const pickerHolder: {
  onChange: ((event: { type: string }, date?: Date) => void) | null;
  props: Record<string, unknown> | null;
} = { onChange: null, props: null };

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  const MockPicker = (props: Record<string, unknown>) => {
    pickerHolder.onChange = props.onChange as typeof pickerHolder.onChange;
    pickerHolder.props = props;
    return <View testID="mock-datetimepicker" />;
  };
  return { __esModule: true, default: MockPicker };
});

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

import { DateTimeField, nowDateString, nowTimeString } from '@/components/ui/DateTimeField';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

beforeEach(() => {
  pickerHolder.onChange = null;
  pickerHolder.props = null;
});

describe('DateTimeField', () => {
  test('renders the visible label and current value (date mode)', () => {
    renderWithTheme(
      <DateTimeField label="Shift Date" mode="date" value="2026-06-17" onChange={() => {}} />,
    );
    expect(screen.getByText('Shift Date')).toBeTruthy();
    expect(screen.getByText('2026-06-17')).toBeTruthy();
  });

  test('renders the current value (time mode)', () => {
    renderWithTheme(
      <DateTimeField label="Start Time" mode="time" value="19:00" onChange={() => {}} />,
    );
    expect(screen.getByText('Start Time')).toBeTruthy();
    expect(screen.getByText('19:00')).toBeTruthy();
  });

  test('shows a placeholder when value is empty', () => {
    renderWithTheme(<DateTimeField mode="date" value="" onChange={() => {}} />);
    expect(screen.getByText('YYYY-MM-DD')).toBeTruthy();
  });

  test('does not render a visible label when none is provided', () => {
    renderWithTheme(<DateTimeField mode="time" value="07:00" onChange={() => {}} />);
    // The value still shows; there is simply no heading text above it.
    expect(screen.getByText('07:00')).toBeTruthy();
  });

  test('does NOT mount the native picker until the trigger is pressed', () => {
    renderWithTheme(
      <DateTimeField label="Shift Date" mode="date" value="2026-06-17" onChange={() => {}} />,
    );
    expect(screen.queryByTestId('mock-datetimepicker')).toBeNull();

    fireEvent.press(screen.getByLabelText('Select date, currently 2026-06-17'));
    expect(screen.getByTestId('mock-datetimepicker')).toBeTruthy();
  });

  test('a simulated "set" event emits a YYYY-MM-DD string in date mode', () => {
    const onChange = jest.fn();
    renderWithTheme(
      <DateTimeField label="Shift Date" mode="date" value="2026-06-17" onChange={onChange} />,
    );
    fireEvent.press(screen.getByLabelText('Select date, currently 2026-06-17'));

    expect(pickerHolder.onChange).toBeTruthy();
    // March 9 2026, local time — the formatter must zero-pad month & day.
    pickerHolder.onChange?.({ type: 'set' }, new Date(2026, 2, 9, 14, 30));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2026-03-09');
  });

  test('a simulated "set" event emits an HH:MM 24h string in time mode', () => {
    const onChange = jest.fn();
    renderWithTheme(
      <DateTimeField label="Start Time" mode="time" value="19:00" onChange={onChange} />,
    );
    fireEvent.press(screen.getByLabelText('Select time, currently 19:00'));

    expect(pickerHolder.onChange).toBeTruthy();
    // 03:05 local — must pad to '03:05', never emit seconds/timezone.
    pickerHolder.onChange?.({ type: 'set' }, new Date(2026, 5, 17, 3, 5));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('03:05');
  });

  test('a "dismissed" event does not call onChange', () => {
    const onChange = jest.fn();
    renderWithTheme(
      <DateTimeField label="Start Time" mode="time" value="19:00" onChange={onChange} />,
    );
    fireEvent.press(screen.getByLabelText('Select time, currently 19:00'));

    pickerHolder.onChange?.({ type: 'dismissed' }, undefined);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('passes mode through to the native picker', () => {
    renderWithTheme(
      <DateTimeField label="Start Time" mode="time" value="19:00" onChange={() => {}} />,
    );
    fireEvent.press(screen.getByLabelText('Select time, currently 19:00'));
    expect(pickerHolder.props?.mode).toBe('time');
  });

  test('renders a "Now" affordance only when onNow is provided, and fires it', () => {
    const onNow = jest.fn();
    const { rerender } = renderWithTheme(
      <DateTimeField label="Start Time" mode="time" value="19:00" onChange={() => {}} />,
    );
    // No onNow → no "Now" button.
    expect(screen.queryByLabelText('Use current time')).toBeNull();

    rerender(
      <ThemeContext.Provider
        value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
      >
        <DateTimeField label="Start Time" mode="time" value="19:00" onChange={() => {}} onNow={onNow} />
      </ThemeContext.Provider>,
    );

    const nowBtn = screen.getByLabelText('Use current time');
    expect(nowBtn).toBeTruthy();
    fireEvent.press(nowBtn);
    expect(onNow).toHaveBeenCalledTimes(1);
  });

  test('the "Now" affordance uses a date-specific label in date mode', () => {
    renderWithTheme(
      <DateTimeField label="Shift Date" mode="date" value="2026-06-17" onChange={() => {}} onNow={() => {}} />,
    );
    expect(screen.getByLabelText('Use current date')).toBeTruthy();
  });
});

describe('DateTimeField quick-fill helpers', () => {
  test('nowDateString formats a Date as YYYY-MM-DD', () => {
    expect(nowDateString(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05');
  });

  test('nowTimeString formats a Date as zero-padded HH:MM (24h)', () => {
    expect(nowTimeString(new Date(2026, 0, 5, 3, 7))).toBe('03:07');
    expect(nowTimeString(new Date(2026, 0, 5, 23, 45))).toBe('23:45');
  });

  test('the helpers round-trip the current instant in the expected shapes', () => {
    expect(nowDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(nowTimeString()).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  });
});
