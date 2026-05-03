/**
 * SafeBlurView — cross-platform BlurView wrapper.
 *
 * expo-blur's native blur on Android requires API 31+ (Android 12) via
 * `android.graphics.RenderEffect`. On older devices the native view can fail
 * to initialise, throwing a render error that propagates to ErrorBoundary.
 *
 * This component:
 *  • iOS / Android 12+ → delegates to BlurView (native blur)
 *  • Android < 12       → renders a plain View with a matching semi-opaque bg
 *
 * Usage: drop-in replacement for BlurView — same props, same JSX shape.
 */
import React from 'react';
import { Platform, View, ViewStyle, StyleProp } from 'react-native';
import { BlurView, BlurViewProps } from 'expo-blur';

// ─── Platform detection ───────────────────────────────────────────────────────

const ANDROID_API: number =
    Platform.OS === 'android' && typeof Platform.Version === 'number'
        ? Platform.Version
        : 0;

/** True when the device can render native blur */
export const BLUR_SUPPORTED =
    Platform.OS !== 'android' || ANDROID_API >= 31;

// ─── Fallback colour map (mirrors expo-blur tints) ───────────────────────────

const FALLBACK_COLORS: Record<BlurViewProps['tint'] & string, string> = {
    dark:        'rgba(12, 12, 16, 0.92)',
    light:       'rgba(255, 255, 255, 0.88)',
    default:     'rgba(22, 27, 34, 0.88)',
    extraLight:  'rgba(255, 255, 255, 0.95)',
    prominent:   'rgba(12, 12, 16, 0.92)',
    regular:     'rgba(22, 27, 34, 0.88)',
    systemMaterial:              'rgba(22, 27, 34, 0.88)',
    systemMaterialLight:         'rgba(255, 255, 255, 0.88)',
    systemMaterialDark:          'rgba(12, 12, 16, 0.92)',
    systemChromeMaterial:        'rgba(22, 27, 34, 0.88)',
    systemChromeMaterialLight:   'rgba(255, 255, 255, 0.88)',
    systemChromeMaterialDark:    'rgba(12, 12, 16, 0.92)',
    systemThickMaterial:         'rgba(22, 27, 34, 0.92)',
    systemThickMaterialLight:    'rgba(255, 255, 255, 0.92)',
    systemThickMaterialDark:     'rgba(12, 12, 16, 0.95)',
    systemThinMaterial:          'rgba(22, 27, 34, 0.80)',
    systemThinMaterialLight:     'rgba(255, 255, 255, 0.80)',
    systemThinMaterialDark:      'rgba(12, 12, 16, 0.80)',
    systemUltraThinMaterial:     'rgba(22, 27, 34, 0.70)',
    systemUltraThinMaterialLight:'rgba(255, 255, 255, 0.70)',
    systemUltraThinMaterialDark: 'rgba(12, 12, 16, 0.70)',
};

// ─── Component ────────────────────────────────────────────────────────────────

export type SafeBlurViewProps = Omit<BlurViewProps, 'children'> & {
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
};

export function SafeBlurView({
    children,
    style,
    tint = 'default',
    intensity = 50,
    ...rest
}: SafeBlurViewProps) {
    if (BLUR_SUPPORTED) {
        return (
            <BlurView tint={tint} intensity={intensity} style={style} {...rest}>
                {children}
            </BlurView>
        );
    }

    const bg = FALLBACK_COLORS[tint as string] ?? FALLBACK_COLORS['default']!;

    return (
        <View style={[{ backgroundColor: bg }, style]} {...(rest as any)}>
            {children}
        </View>
    );
}
