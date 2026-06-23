/**
 * SleepPerformanceChart — Zeitra analytics weekly bars.
 *
 * A NEW local presentational component for the Analytics (Insights) tab. Renders
 * the 7-day "Sleep Quality" (bars) + "Alertness" (line overlay) correlation using
 * `react-native-gifted-charts` (already an app dependency), themed to the Aurora
 * dark-glass / lime brand. Pure presentation: it owns no data hooks — the screen
 * passes already-shaped `data`, so every data path / empty-state stays on-screen.
 */
import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useTheme } from '@/theme';
import { withAlpha } from '@/theme/utils';

export interface SleepPerfPoint {
  day: string;
  /** 0–100 sleep-quality score. */
  sleep: number;
  /** 0–100 alertness score. */
  alert: number;
}

interface Props {
  data: SleepPerfPoint[];
  /** Available inner width for the chart (card width minus its padding). */
  width: number;
}

export function SleepPerformanceChart({ data, width }: Props) {
  const { colors, typography } = useTheme();

  // gifted-charts wants a flat array of bars; we colour the most-recent (last)
  // day's bar in full brand-lime and fade the rest so "today" reads as the hero.
  const barData = useMemo(
    () =>
      data.map((d, i) => {
        const isLast = i === data.length - 1;
        return {
          value: d.sleep,
          // Alertness rides on top as a thin "target"-style line via lineData.
          label: d.day,
          frontColor: isLast ? colors.accent.coral : withAlpha(colors.accent.coral, 0.35),
          gradientColor: isLast
            ? colors.accent.coralDark
            : withAlpha(colors.accent.coralDark, 0.25),
          labelTextStyle: {
            color: isLast ? colors.text.primary : colors.text.secondary,
            fontFamily: typography.caption.fontFamily,
            fontSize: 10,
          },
        };
      }),
    [data, colors, typography],
  );

  const lineData = useMemo(
    () => data.map((d) => ({ value: d.alert })),
    [data],
  );

  // Snug the bars to the available width: 7 cols → bar + spacing budget.
  const barWidth = Math.max(12, Math.round((width - 32) / 7) - 12);

  return (
    <View>
      <BarChart
        data={barData}
        height={150}
        width={width}
        barWidth={barWidth}
        spacing={12}
        initialSpacing={10}
        endSpacing={0}
        barBorderRadius={6}
        showGradient
        noOfSections={4}
        maxValue={100}
        yAxisThickness={0}
        xAxisThickness={0}
        hideRules={false}
        rulesType="solid"
        rulesColor={withAlpha(colors.text.tertiary, 0.12)}
        hideYAxisText
        disableScroll
        isAnimated
        animationDuration={650}
        // Alertness overlay — thin lime-light line tracking performance.
        showLine
        lineData={lineData}
        lineConfig={{
          color: colors.accent.coralLight,
          thickness: 2,
          curved: true,
          hideDataPoints: false,
          dataPointsColor: colors.accent.coralLight,
          dataPointsRadius: 3,
          shiftY: 0,
        }}
      />
      {/* Tiny baseline tick so an all-zero week still shows the day axis. */}
      {data.every((d) => d.sleep === 0 && d.alert === 0) ? (
        <Text
          style={[
            typography.caption,
            { color: colors.text.tertiary, textAlign: 'center', marginTop: 8 },
          ]}
        >
          —
        </Text>
      ) : null}
    </View>
  );
}
