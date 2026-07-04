/**
 * Widget task handler — the headless entry Android calls to (re)draw the widget.
 *
 * Registered in index.js via registerWidgetTaskHandler. It runs OUTSIDE the app's
 * React tree (a headless JS task), fired by Android on:
 *   - WIDGET_ADDED   — the user drops the widget on their home screen
 *   - WIDGET_UPDATE  — the periodic `updatePeriodMillis` tick (and app-requested
 *                      updates via requestWidgetUpdate)
 *   - WIDGET_RESIZED — the user resizes it
 * On each of those we read the cached snapshot, derive the render view against the
 * CURRENT time (so the countdown ticks down between updates without the app running)
 * and hand the widget tree to `renderWidget`.
 *
 * Clicks use the built-in OPEN_URI action (see CycleWidget) which Android handles
 * directly, so WIDGET_CLICK never reaches here — there's nothing to do for it.
 *
 * IMPORTANT: keep this file's imports headless-safe (only ./CycleWidget + ./snapshot
 * + react). It must NOT pull axios / expo-router / the theme in — see snapshot.ts.
 */

import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { CycleWidget } from './CycleWidget';
import { CYCLE_WIDGET_NAME, deriveView, readSnapshot } from './snapshot';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
    const { widgetInfo, widgetAction } = props;

    // Only our widget — defensive if more widgets are added to the plugin later.
    if (widgetInfo.widgetName !== CYCLE_WIDGET_NAME) return;

    switch (widgetAction) {
        case 'WIDGET_ADDED':
        case 'WIDGET_UPDATE':
        case 'WIDGET_RESIZED': {
            const snapshot = await readSnapshot();
            const view = deriveView(snapshot);
            props.renderWidget(<CycleWidget view={view} />);
            break;
        }
        // OPEN_URI clicks are handled by Android directly; nothing to render here.
        case 'WIDGET_CLICK':
        case 'WIDGET_DELETED':
        default:
            break;
    }
}
