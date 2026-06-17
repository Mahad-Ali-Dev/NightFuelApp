import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { typography as themeTypography } from '@/theme/typography';
import { borderRadius as br } from '@/theme/spacing';
import { withAlpha } from '@/theme/utils';
import { format, isValid, parse } from 'date-fns';

/**
 * DateTimeField — a themed native date/time picker that emits the EXACT string
 * contract the log-form validators expect:
 *
 *   - mode="date" → 'YYYY-MM-DD'   (date-fns format(d, 'yyyy-MM-dd'))
 *   - mode="time" → 'HH:MM' 24h    (date-fns format(d, 'HH:mm'))
 *
 * It never emits seconds or a timezone. The visible trigger matches the
 * existing `inputBox` look used across the logging modals (Card/Input visual
 * language via theme tokens): a bordered row with a leading Ionicon and the
 * current value text.
 *
 * Why a picker: tired shift workers cannot reliably type 'YYYY-MM-DD' / 'HH:MM'
 * at 03:00 (P0 carry-over). The picker fixes entry while keeping the string
 * contract `logFormSchemas` validates byte-identical.
 *
 * Platform behaviour mirrors the @react-native-community/datetimepicker docs:
 *   - Android: the picker is a modal dialog. We mount it only while `open` and
 *     unmount on the first 'set'/'dismissed' event (otherwise it re-opens on
 *     every render).
 *   - iOS: the picker is an inline spinner that stays mounted while `open`.
 */

// ── String helpers (exported for callers' "Now" quick-fill) ─────────────────────

/** Current local date as 'YYYY-MM-DD' — same format `mode="date"` emits. */
export function nowDateString(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd');
}

/** Current local time as 'HH:MM' (24h) — same format `mode="time"` emits. */
export function nowTimeString(d: Date = new Date()): string {
  return format(d, 'HH:mm');
}

/**
 * Seed the picker's initial Date from the field's current string value.
 *   - date mode parses 'YYYY-MM-DD' at local midnight.
 *   - time mode parses today's date + the 'HH:MM' value.
 * Falls back to `now` when the value is empty or unparseable so the picker
 * always opens on a sensible instant.
 */
function seedDate(value: string, mode: 'date' | 'time', now: Date = new Date()): Date {
  if (value) {
    if (mode === 'date') {
      const parsed = parse(value, 'yyyy-MM-dd', now);
      if (isValid(parsed)) return parsed;
    } else {
      const parsed = parse(value, 'HH:mm', now);
      if (isValid(parsed)) return parsed;
    }
  }
  return now;
}

export interface DateTimeFieldProps {
  /**
   * Optional visible field label rendered above the trigger. When omitted (e.g.
   * a caller that already groups fields under its own section header), no label
   * Text is rendered — but the trigger still exposes a descriptive
   * `accessibilityLabel` so screen readers always announce the field.
   */
  label?: string;
  value: string;
  mode: 'date' | 'time';
  onChange: (value: string) => void;
  error?: string;
  accessibilityLabel?: string;
  maximumDate?: Date;
  minimumDate?: Date;
  /** When provided, renders a small "Now" quick-fill affordance. */
  onNow?: () => void;
}

export function DateTimeField({
  label,
  value,
  mode,
  onChange,
  error,
  accessibilityLabel,
  maximumDate,
  minimumDate,
  onNow,
}: DateTimeFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const iconName = mode === 'date' ? 'calendar-outline' : 'time-outline';

  // Descriptive a11y label that reflects the current value, e.g.
  // "Select date, currently 2026-06-17" / "Select time, currently 19:00".
  const triggerA11yLabel =
    accessibilityLabel ??
    (mode === 'date'
      ? `Select date${value ? `, currently ${value}` : ''}`
      : `Select time${value ? `, currently ${value}` : ''}`);

  const nowA11yLabel = mode === 'date' ? 'Use current date' : 'Use current time';

  const handlePickerChange = (event: DateTimePickerEvent, date?: Date) => {
    // Android: the dialog manages its own lifecycle — close on any event.
    // iOS: the inline spinner stays mounted; the parent can dismiss via the
    // trigger, but we keep it open so the user can keep scrolling the wheel.
    if (Platform.OS === 'android') {
      setOpen(false);
    }
    // Only emit on a confirmed selection. 'dismissed' (and any non-'set' type)
    // leaves the current value untouched.
    if (event.type === 'set' && date) {
      onChange(mode === 'date' ? format(date, 'yyyy-MM-dd') : format(date, 'HH:mm'));
    }
  };

  return (
    <View>
      {label ? (
        <Text style={[themeTypography.heading, styles.label, { color: colors.text.primary }]}>
          {label}
        </Text>
      ) : null}
      <View style={styles.triggerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={triggerA11yLabel}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.inputBox,
            {
              backgroundColor: colors.background.secondary,
              borderColor: error ? colors.accent.red : colors.border.default,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name={iconName} size={20} color={colors.text.secondary} />
          <Text
            style={[styles.valueText, { color: value ? colors.text.primary : colors.text.tertiary }]}
            numberOfLines={1}
          >
            {value || (mode === 'date' ? 'YYYY-MM-DD' : 'HH:MM')}
          </Text>
        </Pressable>

        {onNow ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={nowA11yLabel}
            onPress={onNow}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [
              styles.nowButton,
              {
                backgroundColor: withAlpha(colors.accent.cyan, 0.12),
                borderColor: withAlpha(colors.accent.cyan, 0.25),
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[themeTypography.captionMedium, { color: colors.accent.cyan }]}>Now</Text>
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <DateTimePicker
          value={seedDate(value, mode)}
          mode={mode}
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onChange={handlePickerChange}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: 12,
    fontSize: 16,
  },
  triggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: br.lg,
    paddingHorizontal: 12,
    height: 52,
  },
  valueText: {
    flex: 1,
    marginLeft: 8,
    fontFamily: themeTypography.body.fontFamily,
    fontSize: 16,
  },
  nowButton: {
    marginLeft: 10,
    paddingHorizontal: 14,
    height: 52,
    borderRadius: br.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
