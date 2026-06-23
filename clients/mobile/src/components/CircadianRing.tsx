/**
 * CircadianRing — Zeitra's signature 24-hour circadian clock/timeline.
 *
 * A striking SVG dial that plots the body's biological windows around a 24h
 * clock: the optimal feeding / activation window is drawn as a thick LIME arc
 * (the brand "go" window), with melatonin / caffeine-cutoff / insulin markers
 * pinned at their clock positions. A faint tick ring + a "now" hand give it the
 * feel of a real chronometer. The centre holds the entrainment score (or a dash
 * when no AI model has scored the user yet).
 *
 * PURELY PRESENTATIONAL — it takes already-formatted "HH:MM" window strings and
 * an optional score; it owns no data and no navigation. All colours come from
 * the caller (Zeitra theme tokens) so it re-themes for free (Aurora / NightRead)
 * and never hardcodes a brand hex.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, type TextStyle } from 'react-native';
import Svg, { Circle, Line, Path, G } from 'react-native-svg';
import { withAlpha } from '@/theme/utils';

export interface CircadianRingProps {
    /** Diameter in px. Default 240. */
    size?: number;
    /** Centre numeral — the entrainment score (0–100), or null for "--". */
    score?: number | null;
    /** Lime "optimal" arc start, "HH:MM" 24h. Default derives nothing — pass it. */
    optimalStart?: string;
    /** Lime "optimal" arc end, "HH:MM" 24h. */
    optimalEnd?: string;
    /** Window markers pinned around the dial. `time` is "HH:MM"; falsy/`--:--` is skipped. */
    markers?: Array<{ key: string; time?: string; color: string }>;
    /** Ring + tick colour. */
    trackColor: string;
    /** Lime optimal-arc colour (brand). */
    optimalColor: string;
    /** Centre text colour for the score. */
    scoreColor: string;
    /** Centre label + sublabel colour. */
    labelColor: string;
    /** Small caption under the score (e.g. "Entrainment"). */
    centerLabel?: string;
    /** Optional "now" fraction 0–1 of the day (defaults to live local time). */
    nowFraction?: number;
    /** Score numeral font family (mono) — passed so the dial matches app type. */
    scoreFontFamily?: string;
}

/** "HH:MM" → fraction of a 24h day [0,1). Returns null on anything unparseable. */
function timeToFraction(t?: string): number | null {
    if (!t || t === '--:--') return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
    return (h + min / 60) / 24;
}

/** Polar point on the dial. 12 o'clock (midnight) is up; clockwise = later. */
function pointOnDial(cx: number, cy: number, r: number, fraction: number) {
    // -90° puts fraction 0 (midnight) at the top; +360°·fraction goes clockwise.
    const angle = (fraction * 360 - 90) * (Math.PI / 180);
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/** SVG arc path between two day fractions along radius r (clockwise). */
function arcPath(cx: number, cy: number, r: number, startF: number, endF: number) {
    // Normalise so the arc always sweeps forward (clockwise) from start→end.
    let sweep = endF - startF;
    if (sweep <= 0) sweep += 1; // wraps past midnight
    const start = pointOnDial(cx, cy, r, startF);
    const end = pointOnDial(cx, cy, r, endF);
    const largeArc = sweep > 0.5 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function CircadianRingComponent({
    size = 240,
    score,
    optimalStart,
    optimalEnd,
    markers = [],
    trackColor,
    optimalColor,
    scoreColor,
    labelColor,
    centerLabel = 'Entrainment',
    nowFraction,
    scoreFontFamily,
}: CircadianRingProps) {
    const cx = size / 2;
    const cy = size / 2;
    const stroke = Math.max(10, size * 0.05);
    const r = (size - stroke) / 2 - 2;

    // Live "now" position on the dial (fraction of day) unless overridden.
    const now = useMemo(() => {
        if (typeof nowFraction === 'number') return Math.max(0, Math.min(1, nowFraction));
        const d = new Date();
        return (d.getHours() + d.getMinutes() / 60) / 24;
    }, [nowFraction]);

    // 24 hour ticks (every hour), with the quarter-hours emphasised.
    const ticks = useMemo(() => {
        const out: Array<{ x1: number; y1: number; x2: number; y2: number; major: boolean }> = [];
        for (let h = 0; h < 24; h++) {
            const f = h / 24;
            const major = h % 6 === 0; // 0 / 6 / 12 / 18 — the quadrants
            const inner = pointOnDial(cx, cy, r - stroke / 2 - (major ? 10 : 6), f);
            const outer = pointOnDial(cx, cy, r - stroke / 2 - 2, f);
            out.push({ x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y, major });
        }
        return out;
    }, [cx, cy, r, stroke]);

    const startF = timeToFraction(optimalStart);
    const endF = timeToFraction(optimalEnd);
    const hasOptimal = startF !== null && endF !== null;

    const nowPoint = pointOnDial(cx, cy, r, now);

    const scoreText = typeof score === 'number' ? String(score) : '--';
    const scoreStyle: TextStyle = {
        color: scoreColor,
        fontSize: size * 0.21,
        lineHeight: size * 0.23,
        ...(scoreFontFamily ? { fontFamily: scoreFontFamily } : { fontWeight: '800' }),
    };

    return (
        <View style={[styles.wrap, { width: size, height: size }]}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {/* Base track */}
                <Circle cx={cx} cy={cy} r={r} stroke={withAlpha(trackColor, 0.5)} strokeWidth={stroke} fill="none" />

                {/* Hour ticks */}
                <G>
                    {ticks.map((t, i) => (
                        <Line
                            key={i}
                            x1={t.x1}
                            y1={t.y1}
                            x2={t.x2}
                            y2={t.y2}
                            stroke={withAlpha(trackColor, t.major ? 0.9 : 0.45)}
                            strokeWidth={t.major ? 2 : 1}
                            strokeLinecap="round"
                        />
                    ))}
                </G>

                {/* Optimal feeding / activation window — the LIME brand arc */}
                {hasOptimal && (
                    <>
                        <Path
                            d={arcPath(cx, cy, r, startF as number, endF as number)}
                            stroke={withAlpha(optimalColor, 0.22)}
                            strokeWidth={stroke + 6}
                            strokeLinecap="round"
                            fill="none"
                        />
                        <Path
                            d={arcPath(cx, cy, r, startF as number, endF as number)}
                            stroke={optimalColor}
                            strokeWidth={stroke}
                            strokeLinecap="round"
                            fill="none"
                        />
                    </>
                )}

                {/* Window markers (melatonin / caffeine / insulin / temp) */}
                {markers.map((m) => {
                    const f = timeToFraction(m.time);
                    if (f === null) return null;
                    const p = pointOnDial(cx, cy, r, f);
                    return (
                        <G key={m.key}>
                            <Circle cx={p.x} cy={p.y} r={stroke * 0.62} fill={withAlpha(m.color, 0.25)} />
                            <Circle cx={p.x} cy={p.y} r={stroke * 0.34} fill={m.color} />
                        </G>
                    );
                })}

                {/* "Now" hand — a slim spoke from centre to the rim */}
                <Line
                    x1={cx}
                    y1={cy}
                    x2={nowPoint.x}
                    y2={nowPoint.y}
                    stroke={withAlpha(scoreColor, 0.55)}
                    strokeWidth={2}
                    strokeLinecap="round"
                />
                <Circle cx={cx} cy={cy} r={4} fill={scoreColor} />
                <Circle cx={nowPoint.x} cy={nowPoint.y} r={4.5} fill={scoreColor} />
            </Svg>

            {/* Centre readout */}
            <View style={styles.center} pointerEvents="none">
                <Text style={scoreStyle} maxFontSizeMultiplier={1.2}>
                    {scoreText}
                    <Text style={{ color: labelColor, fontSize: size * 0.07, fontWeight: '600' }}>/100</Text>
                </Text>
                <Text
                    style={[styles.centerLabel, { color: labelColor }]}
                    maxFontSizeMultiplier={1.2}
                >
                    {centerLabel}
                </Text>
            </View>
        </View>
    );
}

/** Memoized: all props are primitives / a tiny stable marker array — pure SVG. */
export const CircadianRing = React.memo(CircadianRingComponent);

const styles = StyleSheet.create({
    wrap: { alignItems: 'center', justifyContent: 'center' },
    center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    centerLabel: {
        fontSize: 11,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        fontWeight: '600',
        marginTop: 2,
    },
});
