/**
 * KeyboardAvoidingWrapper — the one house keyboard-avoidance wrapper.
 *
 * Several screens with a pinned composer (the Ria AI coach, the DM thread, the
 * create-post sheet) each hand-rolled a `KeyboardAvoidingView` with subtly
 * different `behavior`/offset values, and a few left the input UNDER the keyboard
 * because the offset never accounted for the translucent header that sits above
 * the avoiding view. This factors the correct recipe into one place so every
 * composer lifts identically on BOTH platforms:
 *
 *   - iOS  → behavior="padding": the avoiding view grows a bottom pad equal to the
 *     keyboard height. `keyboardVerticalOffset` tells it how much fixed chrome
 *     (a header, the status-bar safe-area) sits ABOVE its frame so the lift lands
 *     exactly at the keyboard's top edge and not short of it.
 *   - Android → behavior="height": shrink the avoiding view to the space above the
 *     keyboard. This is reliable even when a screen draws under a translucent
 *     status bar with a manual `paddingTop: insets.top` (where the default
 *     window `adjustResize` alone can leave the input partly covered).
 *
 * It is a layout wrapper only — it forwards `style` verbatim and renders its
 * children, so callers keep full control of their header / list / input tree.
 * `offset` lets a screen whose header is a SIBLING above the wrapper pass that
 * header's height; screens that wrap their own header can leave it at 0.
 */
import React from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    StyleProp,
    ViewStyle,
} from 'react-native';

interface KeyboardAvoidingWrapperProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    /**
     * Extra vertical offset (px) for the height of any fixed chrome that sits
     * ABOVE the avoiding view (e.g. a sibling header). Applied on iOS only —
     * Android's "height" behavior measures from the resized window, so an offset
     * there would double-count. Defaults to 0.
     */
    offset?: number;
}

export function KeyboardAvoidingWrapper({
    children,
    style,
    offset = 0,
}: KeyboardAvoidingWrapperProps) {
    return (
        <KeyboardAvoidingView
            style={style}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? offset : 0}
        >
            {children}
        </KeyboardAvoidingView>
    );
}
