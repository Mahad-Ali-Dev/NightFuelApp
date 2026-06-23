/**
 * GroceryItemRow — a satisfying checkable grocery line (Zeitra).
 *
 * The brief's "satisfying checked states" + "swipe/clear affordances", factored
 * into one self-contained row so the grocery screen can render both its local
 * (AsyncStorage) items and its backend weekly-plan items through the same tactile
 * primitive. PURE PRESENTATION — owns no data and fires nothing on its own; every
 * tap / long-press / clear is delegated to the caller's handlers.
 *
 * What makes the checked state feel good (transform/opacity only — never layout):
 *   • the check chip springs a subtle scale pop on each toggle (Reanimated),
 *   • checked → the chip fills Zeitra lime with an INK glyph (brand: ink-on-lime,
 *     never white), and the label cross-fades to a struck-through dimmed style,
 *   • the whole row springs to a 0.97 inset on press (house pressed-scale).
 *
 * a11y: the row is the checkbox (role + checked state + label); the trailing
 * clear control is a separate 44pt button with its own label and hitSlop. Colors
 * come straight from useTheme() tokens so light/dark + Night Read all re-theme.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface GroceryItemRowProps {
  /** Item display name. */
  name: string;
  /** Secondary meta line (e.g. "Qty: 2" or "500 g"). Hidden when empty. */
  meta?: string;
  checked: boolean;
  /** Primary toggle (whole-row tap). */
  onToggle: () => void;
  /** Optional remove handler — renders the trailing clear control + long-press. */
  onRemove?: () => void;
  /** When false, hides the bottom hairline (last row in a stack). */
  showDivider?: boolean;
  testID?: string;
}

function GroceryItemRowComponent({
  name,
  meta,
  checked,
  onToggle,
  onRemove,
  showDivider = true,
  testID,
}: GroceryItemRowProps) {
  const { colors } = useTheme();

  // Whole-row pressed inset (house recipe).
  const rowScale = useSharedValue(1);
  // Check-chip pop: springs past 1 on toggle then settles (drives the "satisfying" feel).
  const chipScale = useSharedValue(1);
  // 0 → unchecked, 1 → checked. Cross-fades the label dim/strike without re-layout.
  const checkP = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    chipScale.value = withSpring(1.18, { damping: 9, stiffness: 320 }, () => {
      chipScale.value = withSpring(1, { damping: 14, stiffness: 320 });
    });
    checkP.value = withTiming(checked ? 1 : 0, { duration: 180 });
    // Animate only when the checked flag flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked]);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ scale: rowScale.value }] }));
  const chipStyle = useAnimatedStyle(() => ({ transform: [{ scale: chipScale.value }] }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: 1 - checkP.value * 0.5 }));

  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onToggle();
  };

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={name}
      onPress={handlePress}
      onLongPress={onRemove}
      onPressIn={() => { rowScale.value = withSpring(0.97, { damping: 18, stiffness: 320 }); }}
      onPressOut={() => { rowScale.value = withSpring(1, { damping: 18, stiffness: 320 }); }}
      style={[
        styles.row,
        rowStyle,
        showDivider && { borderBottomWidth: 1, borderBottomColor: colors.border.default },
      ]}
    >
      {/* Check chip — fills lime w/ ink glyph when checked, springs on toggle */}
      <Animated.View
        style={[
          styles.chip,
          chipStyle,
          checked
            ? { backgroundColor: colors.accent.coral, borderColor: colors.accent.coral }
            : { backgroundColor: withAlpha(colors.text.primary, 0.04), borderColor: colors.border.light },
        ]}
      >
        <Ionicons
          name={checked ? 'checkmark-sharp' : 'ellipse-outline'}
          size={checked ? 20 : 14}
          color={checked ? colors.text.inverse : colors.text.tertiary}
        />
      </Animated.View>

      {/* Label + meta — dim + strike on check (opacity only) */}
      <Animated.View style={[styles.body, labelStyle]}>
        <Text
          numberOfLines={2}
          style={[
            styles.name,
            {
              color: checked ? colors.text.secondary : colors.text.primary,
              textDecorationLine: checked ? 'line-through' : 'none',
            },
          ]}
          maxFontSizeMultiplier={1.4}
        >
          {name}
        </Text>
        {!!meta && (
          <Text style={[styles.meta, { color: colors.text.tertiary }]} maxFontSizeMultiplier={1.4}>
            {meta}
          </Text>
        )}
      </Animated.View>

      {/* Trailing clear affordance (only when removable) */}
      {onRemove && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear"
          onPress={onRemove}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.clearBtn}
        >
          <Ionicons name="close-circle" size={20} color={colors.text.tertiary} />
        </Pressable>
      )}
    </AnimatedPressable>
  );
}

/** Memoized — props are primitives; re-renders only when a row's own data changes. */
export const GroceryItemRow = React.memo(GroceryItemRowComponent);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, minHeight: 60 },
  chip: { width: 30, height: 30, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, marginLeft: 14 },
  name: { fontFamily: 'Barlow_500Medium', fontSize: 15, lineHeight: 20 },
  meta: { fontFamily: 'Barlow_400Regular', fontSize: 12, lineHeight: 16, marginTop: 2 },
  clearBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
});
