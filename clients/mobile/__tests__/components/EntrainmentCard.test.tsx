/**
 * Render tests for the dashboard's <EntrainmentCard /> circadian-entrainment
 * insight card — the FIRST consumer of the F3 helper src/lib/circadian/entrainment.ts.
 *
 * EntrainmentCard is a pure presentational card driven by:
 *   - `score`  : number | null  (the entrainment alignment score)
 *   - `shift?` : { startTime, endTime }  (optional — drives a window hint)
 *
 * It renders the advice copy returned by `entrainmentAdvice(score)`:
 *   1. score >= 80          → ENTRAINMENT_ADVICE.good   ("Good alignment…")
 *   2. finite score < 80    → ENTRAINMENT_ADVICE.improve ("Room for improvement…")
 *   3. score === null       → ENTRAINMENT_ADVICE.none   ("Log more shifts…")
 *
 * These assertions import the REAL `ENTRAINMENT_ADVICE` / `GOOD_ALIGNMENT_THRESHOLD`
 * constants and the REAL `entrainmentAdvice` mapping from the helper, so the
 * suite goes RED the moment that advice mapping regresses (copy drift, a flipped
 * threshold, or a broken null branch) — exactly the dormant-helper guard this
 * card was built to provide.
 *
 * Mocks (matching CaffeineTimerTile.test.tsx / LightPlanCard.test.tsx):
 *  - `@expo/vector-icons` Ionicons → a plain <Text> ("icon:<name>") so glyphs
 *    mount without native code.
 *  - Theme comes from the real `ThemeContext.Provider`.
 *  - The Aurora glass fill (GlassCard → SafeBlurView → expo-blur) mounts under
 *    jest-expo with no extra mock, same as the two suites above.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// Import AFTER the mocks. We pull in the REAL advice constants + mapping so the
// rendered copy is asserted against the source of truth, not a hand-copied
// string — if entrainment.ts's mapping changes, these tests fail loudly.
import { EntrainmentCard } from '@/components/dashboard/EntrainmentCard';
import {
  ENTRAINMENT_ADVICE,
  GOOD_ALIGNMENT_THRESHOLD,
  entrainmentAdvice,
} from '@/lib/circadian/entrainment';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

describe('EntrainmentCard', () => {
  describe('advice copy by score', () => {
    test('score >= 80 shows the good-alignment copy', () => {
      renderWithTheme(<EntrainmentCard score={92} />);

      expect(screen.getByText(ENTRAINMENT_ADVICE.good)).toBeTruthy();
      // The other two advice strings must NOT be present.
      expect(screen.queryByText(ENTRAINMENT_ADVICE.improve)).toBeNull();
      expect(screen.queryByText(ENTRAINMENT_ADVICE.none)).toBeNull();
    });

    test('exactly at the threshold (80) still counts as good alignment', () => {
      renderWithTheme(<EntrainmentCard score={GOOD_ALIGNMENT_THRESHOLD} />);
      expect(screen.getByText(ENTRAINMENT_ADVICE.good)).toBeTruthy();
    });

    test('a finite score below 80 shows the improvement copy', () => {
      renderWithTheme(<EntrainmentCard score={42} />);

      expect(screen.getByText(ENTRAINMENT_ADVICE.improve)).toBeTruthy();
      expect(screen.queryByText(ENTRAINMENT_ADVICE.good)).toBeNull();
      expect(screen.queryByText(ENTRAINMENT_ADVICE.none)).toBeNull();
    });

    test('score === null shows the "log more shifts" copy and never throws', () => {
      // Default-safe path: rendering with score=null must not throw.
      expect(() => renderWithTheme(<EntrainmentCard score={null} />)).not.toThrow();

      expect(screen.getByText(ENTRAINMENT_ADVICE.none)).toBeTruthy();
      expect(screen.queryByText(ENTRAINMENT_ADVICE.good)).toBeNull();
      expect(screen.queryByText(ENTRAINMENT_ADVICE.improve)).toBeNull();
    });

    test('rendered copy matches entrainmentAdvice() across the score range', () => {
      // Card ↔ helper parity: for each representative score the rendered string
      // is exactly what entrainmentAdvice() returns. Regressing the mapping in
      // either place breaks this.
      for (const score of [null, 0, 50, 79, 80, 100]) {
        const { unmount } = renderWithTheme(<EntrainmentCard score={score} />);
        expect(screen.getByText(entrainmentAdvice(score))).toBeTruthy();
        unmount();
      }
    });
  });

  /**
   * Timezone-honest "approx." affordance.
   *
   * The entrainment score is computed in a tz-NAIVE local-clock frame (the
   * model aligns melatoninOnset vs the shift end as minutes-since-LOCAL-
   * midnight — see src/api/circadian.ts shiftEndMinutes), so the card surfaces
   * a subtle "approx." qualifier next to the title whenever a FINITE score is
   * shown. It must NOT appear on the null "Build your baseline" state (there is
   * no estimate to qualify there), and it carries an accessibilityLabel making
   * the local-clock caveat explicit for screen-reader users.
   *
   * Rules cited (see ~/.claude/skills/react-native-skills/rules/):
   *   - rendering-no-falsy-and.md → the affordance uses `score != null ? … :
   *     null`, never `score && <…>`, so a 0 score still renders it safely.
   *   - rendering-text-in-text-component.md → the caption string lives in <Text>.
   */
  describe('timezone-honest "approx." affordance', () => {
    const APPROX_LABEL = 'Approximate alignment, estimated from your local clock';

    test('good state (score 90) renders the "approx." affordance with its a11y label', () => {
      renderWithTheme(<EntrainmentCard score={90} />);

      // The good-alignment title is shown alongside the qualifier.
      expect(screen.getByText('Well aligned')).toBeTruthy();
      expect(screen.getByText('approx.')).toBeTruthy();
      // The accessibilityLabel clarifies it is a local-clock estimate.
      expect(screen.getByLabelText(APPROX_LABEL)).toBeTruthy();
    });

    test('improve state (score 50) renders the "approx." affordance with its a11y label', () => {
      renderWithTheme(<EntrainmentCard score={50} />);

      expect(screen.getByText('Room to improve')).toBeTruthy();
      expect(screen.getByText('approx.')).toBeTruthy();
      expect(screen.getByLabelText(APPROX_LABEL)).toBeTruthy();
    });

    test('a finite zero score still renders the "approx." affordance (no falsy-render skip)', () => {
      // 0 is falsy but a valid finite score — the `!= null` guard keeps it shown.
      renderWithTheme(<EntrainmentCard score={0} />);
      expect(screen.getByText('approx.')).toBeTruthy();
      expect(screen.getByLabelText(APPROX_LABEL)).toBeTruthy();
    });

    test('null state ("Build your baseline") does NOT render the "approx." affordance', () => {
      renderWithTheme(<EntrainmentCard score={null} />);

      expect(screen.getByText('Build your baseline')).toBeTruthy();
      // No finite score → no estimate to qualify → no affordance, no a11y label.
      expect(screen.queryByText('approx.')).toBeNull();
      expect(screen.queryByLabelText(APPROX_LABEL)).toBeNull();
    });
  });

  describe('optional shift window hint', () => {
    test('a valid shift adds the derived wind-down window line', () => {
      // melatoninStart = endTime + 1h → formatted local time. We don't pin the
      // exact clock string (timezone-portable), only that the hint label renders.
      renderWithTheme(
        <EntrainmentCard
          score={88}
          shift={{ startTime: '2026-01-02T22:00:00.000Z', endTime: '2026-01-03T06:00:00.000Z' }}
        />,
      );
      expect(screen.getByText(/Wind-down window opens around/)).toBeTruthy();
    });

    test('a malformed shift never throws — the hint line is simply omitted', () => {
      // deriveWindowsFromShift throws on unparseable input; the card swallows it.
      expect(() =>
        renderWithTheme(
          <EntrainmentCard score={88} shift={{ startTime: 'not-a-date', endTime: '' }} />,
        ),
      ).not.toThrow();
      // Advice still renders; the window hint does not.
      expect(screen.getByText(ENTRAINMENT_ADVICE.good)).toBeTruthy();
      expect(screen.queryByText(/Wind-down window opens around/)).toBeNull();
    });

    test('with no shift prop the card renders advice only (no hint line)', () => {
      renderWithTheme(<EntrainmentCard score={50} />);
      expect(screen.getByText(ENTRAINMENT_ADVICE.improve)).toBeTruthy();
      expect(screen.queryByText(/Wind-down window opens around/)).toBeNull();
    });
  });

  /**
   * Live wiring contract (analytics.tsx now feeds this card from
   * useEntrainmentScore → getModel().entrainmentScore + the active shift, NOT
   * the sleep<->performance `performanceCorrelation` proxy it used to alias).
   *
   * The card is PURE/presentational, so its guarantee is exactly this: it
   * renders WHATEVER `score`/`shift` it is handed — it neither knows nor cares
   * that the value now comes from the real entrainment model. These tests pin
   * that contract end-to-end:
   *   - the model-sourced score (passed as a prop) drives the advice copy via
   *     entrainmentAdvice — proving the card surfaces the entrainment-model
   *     value it is given, distinct from any correlation number;
   *   - the active shift (passed as a prop) drives the live Wind-down hint;
   *   - the honest null/error path (no derivable score) → ENTRAINMENT_ADVICE.none,
   *     no hint, no throw.
   *
   * Rules cited (see ~/.claude/skills/react-native-skills/rules/):
   *   - state-ground-truth.md         → the card stores NO state; the rendered
   *     copy/hint are DERIVED purely from the score/shift props (the hook's
   *     query results are the ground truth, projected by useEntrainmentScore).
   *   - rendering-no-falsy-and.md     → a falsy score (0) must still render the
   *     advice text safely and the hint row uses `windowHint != null ? … : null`,
   *     never `value && <…>` — so 0 / '' can't leak outside <Text>.
   *   - imports-design-system-folder.md → the card surfaces via the
   *     `@/components/ui` GlassCard primitive (theme via `@/theme` tokens).
   *   - ui-styling.md                 → hierarchy via weight/color + `gap`,
   *     `borderCurve: 'continuous'` paired with every `borderRadius`.
   */
  describe('live entrainment-model wiring (score from model, not correlation proxy)', () => {
    // A genuine model-derived entrainment score (NOT performanceCorrelation):
    // an entrainment value of 88 maps to the good-alignment copy. We also assert
    // the rendered string is exactly entrainmentAdvice(88), so the card is shown
    // to surface the ENTRAINMENT source it is handed (the card is value-agnostic,
    // but the wiring's intent is that this value originates in the model).
    test('renders the model-sourced score → entrainment advice copy (not a correlation read)', () => {
      const modelEntrainmentScore = 88; // from getModel().entrainmentScore
      renderWithTheme(<EntrainmentCard score={modelEntrainmentScore} />);

      expect(screen.getByText(entrainmentAdvice(modelEntrainmentScore))).toBeTruthy();
      expect(screen.getByText(ENTRAINMENT_ADVICE.good)).toBeTruthy();
      // The card carries the entrainment overline, not a correlation label —
      // it is the circadian-entrainment surface, never the sleep<->performance
      // correlation card.
      expect(screen.getByText('CIRCADIAN ENTRAINMENT')).toBeTruthy();
      expect(screen.queryByText(/SLEEP . PERFORMANCE/)).toBeNull();
    });

    test('the active shift passed alongside the score drives the live Wind-down hint', () => {
      // Exactly what analytics passes: the real entrainment score + the active
      // shift's { startTime, endTime }. The hint is DERIVED from the shift.
      renderWithTheme(
        <EntrainmentCard
          score={88}
          shift={{ startTime: '2026-01-02T22:00:00.000Z', endTime: '2026-01-03T06:00:00.000Z' }}
        />,
      );
      expect(screen.getByText(entrainmentAdvice(88))).toBeTruthy();
      expect(screen.getByText(/Wind-down window opens around/)).toBeTruthy();
    });

    test('honest null path (no derivable model score) → ENTRAINMENT_ADVICE.none, no hint, no throw', () => {
      // useEntrainmentScore returns { score: null, shift: undefined } when there
      // is no shift / no model / no derivable score (or on any query error). The
      // card must render the "log more shifts" copy with NO window hint and
      // without throwing — the default-safe ground-truth path.
      expect(() =>
        renderWithTheme(<EntrainmentCard score={null} shift={undefined} />),
      ).not.toThrow();

      expect(screen.getByText(ENTRAINMENT_ADVICE.none)).toBeTruthy();
      expect(screen.queryByText(ENTRAINMENT_ADVICE.good)).toBeNull();
      expect(screen.queryByText(ENTRAINMENT_ADVICE.improve)).toBeNull();
      expect(screen.queryByText(/Wind-down window opens around/)).toBeNull();
    });

    test('a finite zero score is still surfaced safely (no falsy-render crash)', () => {
      // rendering-no-falsy-and.md: a 0 score is falsy but a valid entrainment
      // value. It must render the improvement advice (0 < 80) without leaking a
      // bare 0 outside <Text>.
      expect(() => renderWithTheme(<EntrainmentCard score={0} />)).not.toThrow();
      expect(screen.getByText(entrainmentAdvice(0))).toBeTruthy();
      expect(screen.getByText(ENTRAINMENT_ADVICE.improve)).toBeTruthy();
    });
  });
});
