/**
 * WeightTrendChart — a lightweight self-hosted area/line sparkline for the Body
 * Metrics weight trend.
 *
 * Built on `react-native-svg` (already a transformed dependency used by
 * CircularProgress) rather than `react-native-gifted-charts`, so screens that
 * mount it stay testable under the repo's jest transform allowlist without each
 * suite having to stub the charts native module. It renders the Zeitra brand
 * lime line with a soft vertical area fill, subtle baseline gridlines, and a
 * highlighted final data point (the latest weigh-in) — the "value lands here"
 * peak cue. Pure presentational: it takes a numeric series + theme colors and
 * draws; all data shaping stays in the screen.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, {
  Path,
  Circle,
  Line,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';

export interface WeightTrendChartProps {
  /** Chronological numeric series (oldest → newest). */
  values: number[];
  width: number;
  height: number;
  /** Line + dot colour (the brand lime). */
  color: string;
  /** Area fill colour (tinted lime); alpha is applied via the gradient stops. */
  fillColor: string;
  /** Hairline gridline colour. */
  gridColor: string;
  /** Latest-point halo colour (card surface) so the dot reads as a ring. */
  dotHaloColor: string;
}

function WeightTrendChartComponent({
  values,
  width,
  height,
  color,
  fillColor,
  gridColor,
  dotHaloColor,
}: WeightTrendChartProps) {
  const padX = 8;
  const padTop = 12;
  const padBottom = 14;
  const innerW = Math.max(1, width - padX * 2);
  const innerH = Math.max(1, height - padTop - padBottom);

  const min = Math.min(...values);
  const max = Math.max(...values);
  // Avoid a divide-by-zero on a flat series — render it as a centred line.
  const span = max - min || 1;

  const n = values.length;
  const stepX = n > 1 ? innerW / (n - 1) : 0;

  const points = values.map((v, i) => {
    const x = padX + i * stepX;
    const y = padTop + innerH - ((v - min) / span) * innerH;
    return { x, y };
  });

  const first = points[0] ?? { x: padX, y: padTop + innerH };
  const last = points[points.length - 1] ?? first;

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');

  const baseY = padTop + innerH;
  const areaPath =
    `M${first.x.toFixed(2)},${baseY.toFixed(2)} ` +
    points.map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') +
    ` L${last.x.toFixed(2)},${baseY.toFixed(2)} Z`;

  // Three faint horizontal gridlines (top / mid / base) for a sense of scale.
  const gridYs = [padTop, padTop + innerH / 2, baseY];
  const gradId = 'weightTrendFill';

  return (
    <View accessible={false}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={fillColor} stopOpacity={0.24} />
            <Stop offset="1" stopColor={fillColor} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {gridYs.map((gy, i) => (
          <Line
            key={i}
            x1={padX}
            y1={gy}
            x2={width - padX}
            y2={gy}
            stroke={gridColor}
            strokeWidth={1}
          />
        ))}

        <Path d={areaPath} fill={`url(#${gradId})`} />
        <Path
          d={linePath}
          stroke={color}
          strokeWidth={3}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Latest weigh-in — haloed ring so the most recent value stands out. */}
        <Circle cx={last.x} cy={last.y} r={6} fill={dotHaloColor} />
        <Circle cx={last.x} cy={last.y} r={4} fill={color} />
      </Svg>
    </View>
  );
}

export const WeightTrendChart = React.memo(WeightTrendChartComponent);
