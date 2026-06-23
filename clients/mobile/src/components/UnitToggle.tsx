/**
 * UnitToggle — a compact two-segment unit switch (Aurora/Zeitra brand).
 *
 * Local-only helper for the onboarding biological-profile step. Renders a small
 * pill-shaped segmented control (e.g. kg / lb, cm / ft) inside a dark-glass
 * track; the active segment lifts to a solid lime (`accent.coral`) fill with INK
 * text — the brand's "chosen" language — while the inactive segment stays muted.
 * Colour is never the only signal: the active segment is also bolder.
 *
 * Pure presentation: owns no data and forwards `onChange` + accessibility to the
 * caller, so the screen keeps every handler. A pressed-scale (Reanimated shared
 * value, transform-only) gives the tactile press feedback, and each segment
 * clears the 44pt touch-target floor via padding + hitSlop. Designed to sit on
 * the same row as a section label, so it is intentionally compact.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

export interface UnitToggleOption<T extends string> {
  value: T;
  label: string;
}

export interface UnitToggleProps<T extends string> {
  /** The two (or more) unit segments to render. */
  options: ReadonlyArray<UnitToggleOption<T>>;
  /** Currently-selected unit value. */
  value: T;
  onChange: (value: T) => void;
  /** Announced as the group's purpose, e.g. "Weight unit". */
  accessibilityLabel?: string;
  testID?: string;
}

function Segment({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors, typography, shadows } = useTheme();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.94, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 130 });
      }}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View
        style={[
          styles.segment,
          {
            backgroundColor: selected ? colors.accent.coral : 'transparent',
          },
          selected ? shadows.glow(colors.accent.coral) : null,
          animatedStyle,
        ]}
      >
        <Text
          style={[
            typography.captionMedium,
            styles.segmentLabel,
            {
              color: selected ? colors.text.inverse : colors.text.secondary,
              fontWeight: selected ? '800' : '500',
            },
          ]}
          maxFontSizeMultiplier={1.3}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function UnitToggle<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  testID,
}: UnitToggleProps<T>) {
  const { colors } = useTheme();

  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        {
          backgroundColor: colors.background.tertiary,
          borderColor: withAlpha(colors.text.primary, 0.08),
        },
      ]}
    >
      {options.map((opt) => (
        <Segment
          key={opt.value}
          label={opt.label}
          selected={value === opt.value}
          accessibilityLabel={`${accessibilityLabel ?? 'Unit'}: ${opt.label}`}
          onPress={() => onChange(opt.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9999,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  segment: {
    minWidth: 44,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: {
    fontSize: 13,
    letterSpacing: 0.2,
  },
});
