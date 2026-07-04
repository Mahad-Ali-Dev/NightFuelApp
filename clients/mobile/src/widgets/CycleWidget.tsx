/**
 * CycleWidget — the Android home-screen widget UI (Period P3).
 *
 * Renders the user's current cycle phase + a days-to-next-period countdown in a
 * compact dark tile that matches the Zeitra look (deep near-black surface, coral
 * period accent, per-phase colour dot, lime wordmark).
 *
 * HEADLESS-SAFE + PRESENTATIONAL: this runs in the widget's headless render pass,
 * NOT in the app. It may ONLY use react-native-android-widget primitives
 * (FlexWidget / TextWidget) — never React Native's View/Text, the theme hook, or
 * anything that touches the DOM/native app context. It takes an already-derived
 * `view` (see snapshot.deriveView) and just draws it; all data/date logic lives in
 * snapshot.ts so this file stays a pure function of its props.
 *
 * HONEST STATES (mirrors the in-app cycle surfaces):
 *  - ineligible → a neutral branded tile (tracking off / non-female / not opted in)
 *  - paused     → pregnancy mode: predictions are paused, so we show no countdown
 *  - no-estimate→ tracking on but no confident phase yet (or the estimate aged out)
 *  - phase      → the phase name + (when confident) the period countdown
 *
 * Tapping anywhere opens the app straight to the Cycle screen via the zeitra://
 * deep link (allow-listed in src/lib/deepLinks.ts).
 */

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp } from 'react-native-android-widget';
import type { CycleWidgetView, ConcretePhase } from './snapshot';

// ── Palette (mirrors src/theme/colors.ts — the widget can't use the theme hook) ──
const C = {
    bg: '#0A0C12', // background.primary (deep near-black)
    surface: '#16181D', // a hair lighter, for the inner chip
    text: '#F4F6FB', // text.primary
    textDim: '#9BA1AD', // text.secondary
    textFaint: '#6B7280', // text.tertiary
    coral: '#FF7A90', // period / cycle signature accent
    lime: '#C2F03C', // brand accent (wordmark)
} as const;

// Per-phase accent — identical mapping to the in-app calendar (CycleCalendar.tsx).
const PHASE_COLOR = {
    MENSTRUAL: '#FF4444', // accent.red
    FOLLICULAR: '#00D4AA', // accent.cyan
    OVULATORY: '#7C4DFF', // accent.purple
    LUTEAL: '#FFB300', // accent.amber
} as const;

const PHASE_LABEL: Record<ConcretePhase, string> = {
    MENSTRUAL: 'Menstrual',
    FOLLICULAR: 'Follicular',
    OVULATORY: 'Ovulatory',
    LUTEAL: 'Luteal',
};

/** The deep link a tap opens — the Cycle screen (see deepLinks.ts allowlist). */
const OPEN_CYCLE_URI = 'zeitra://cycle';

/** Small phase pill: a colour dot + the phase name, in the phase's accent colour. */
function PhaseChip({ phase, dim }: { phase: ConcretePhase; dim?: boolean }) {
    const color = PHASE_COLOR[phase];
    return (
        <FlexWidget
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                height: 'wrap_content',
                width: 'wrap_content',
                backgroundColor: C.surface,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 4,
            }}
        >
            <FlexWidget
                style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: color, marginRight: 6 }}
            />
            <TextWidget
                text={PHASE_LABEL[phase]}
                style={{ fontSize: 12, color: dim ? C.textDim : color, fontWeight: '600' }}
            />
        </FlexWidget>
    );
}

/** The tiny lime "ZEITRA" wordmark that sits top-right in every state. */
function Wordmark() {
    return (
        <TextWidget text="ZEITRA" style={{ fontSize: 10, color: C.lime, fontWeight: '700', letterSpacing: 2 }} />
    );
}

/** Top row: a left slot (usually the phase chip) and the wordmark on the right. */
function TopRow({ left }: { left?: React.ReactNode }) {
    return (
        <FlexWidget
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: 'match_parent',
                height: 'wrap_content',
            }}
        >
            <FlexWidget style={{ height: 'wrap_content', width: 'wrap_content' }}>{left ?? <FlexWidget style={{ height: 1, width: 1 }} />}</FlexWidget>
            <Wordmark />
        </FlexWidget>
    );
}

/** A stacked "big value + caption" block — the tile's focal readout. */
function Focal({ value, valueColor, caption }: { value: string; valueColor: ColorProp; caption: string }) {
    return (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', height: 'wrap_content' }}>
            <TextWidget text={value} style={{ fontSize: 40, color: valueColor, fontWeight: '700' }} />
            <TextWidget text={caption} style={{ fontSize: 13, color: C.textDim, fontWeight: '500' }} />
        </FlexWidget>
    );
}

/** Bottom hint line (cycle day and/or a soft "tap to open"). */
function Footer({ text }: { text: string }) {
    return <TextWidget text={text} style={{ fontSize: 11, color: C.textFaint }} />;
}

/**
 * Build the three body slots (top / focal / footer) for the given view. Kept as a
 * plain switch returning content so the outer shell (background, padding, click) is
 * defined once.
 */
function Body({ view }: { view: CycleWidgetView }) {
    // Ineligible — a neutral branded tile. No cycle data is ever shown here.
    if (view.state === 'ineligible') {
        return (
            <>
                <TopRow />
                <Focal value="Cycle" valueColor={C.text} caption="Tracking is off" />
                <Footer text="Tap to open Zeitra" />
            </>
        );
    }

    // Pregnancy mode — predictions paused; show a gentle label, no countdown.
    if (view.state === 'paused') {
        return (
            <>
                <TopRow />
                <Focal value="Paused" valueColor={C.coral} caption="Pregnancy mode" />
                <Footer text="Tap to open your cycle" />
            </>
        );
    }

    // Tracking on but no confident phase yet (or the estimate aged out).
    if (view.state === 'no-estimate') {
        return (
            <>
                <TopRow />
                <Focal value="Tracking" valueColor={C.text} caption={view.stale ? 'Tap to refresh' : 'No estimate yet'} />
                <Footer text="Tap to open your cycle" />
            </>
        );
    }

    // Concrete phase.
    const phase = view.phase as ConcretePhase;
    const dayLine = view.cycleDay != null ? `Day ${view.cycleDay}` : '';

    // Focal readout: prefer the period countdown; degrade honestly when we can't.
    let value: string;
    let valueColor: ColorProp;
    let caption: string;
    if (view.daysToNextPeriod != null) {
        if (view.daysToNextPeriod === 0) {
            value = 'Today';
            caption = 'Period may start';
        } else {
            value = String(view.daysToNextPeriod);
            caption = view.daysToNextPeriod === 1 ? 'day to period' : 'days to period';
        }
        valueColor = C.coral;
    } else if (view.nextPeriodPassed) {
        // The predicted date has passed and the app hasn't refreshed — nudge a log.
        value = 'Due';
        valueColor = C.coral;
        caption = 'Period expected';
    } else {
        // Confident phase but no countdown (forecast not confident enough): lead
        // with the phase name rather than a fabricated number.
        value = PHASE_LABEL[phase];
        valueColor = PHASE_COLOR[phase];
        caption = 'Current phase';
    }

    const footer = view.nextPeriodPassed ? (dayLine ? `${dayLine} · Tap to log` : 'Tap to log a period') : dayLine || 'Tap to open your cycle';

    return (
        <>
            <TopRow left={<PhaseChip phase={phase} />} />
            <Focal value={value} valueColor={valueColor} caption={caption} />
            <Footer text={footer} />
        </>
    );
}

export interface CycleWidgetProps {
    view: CycleWidgetView;
}

/**
 * The widget shell: a rounded dark tile that fills its cell, tappable to open the
 * Cycle screen. `space-between` spreads the three body slots (top / focal / footer)
 * so the layout stays balanced across the resizable widget's cell sizes.
 */
export function CycleWidget({ view }: CycleWidgetProps) {
    return (
        <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: OPEN_CYCLE_URI }}
            style={{
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: 'match_parent',
                width: 'match_parent',
                backgroundColor: C.bg,
                borderRadius: 20,
                padding: 14,
            }}
        >
            <Body view={view} />
        </FlexWidget>
    );
}

export default CycleWidget;
