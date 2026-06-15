/**
 * Render + interaction tests for the ExerciseDemo "player".
 *
 * These tests VERIFY already-shipped behaviour in
 * `src/components/exercise/ExerciseDemo.tsx` — no source change accompanies them.
 *
 * The two behaviours pinned down here are the component's whole reason for
 * existing ("it NEVER renders an empty or broken player"):
 *
 *   1. Resilient frames — given 2+ HTTPS frames it animates an in-app loop, but
 *      if every frame 404s (each <Image> fires `onError` → `markFailed`), the
 *      live-frame list empties and it falls BACK to the still + an honest
 *      "Video demo coming soon" note rather than a black/broken box.
 *   2. No-media fallback — given no frames and no gifUrl it renders that same
 *      still (`imageUrl`, else the bundled `fallback`) + "coming soon" copy
 *      immediately, and surfaces a "Full tutorial" link only when `tutorialUrl`
 *      is supplied.
 *
 * Mocks (kept minimal):
 *  - `expo-image` Image → a passthrough host <View> that forwards `onError` (and
 *    every other prop) so RTL can both find each frame and fire its error event.
 *    expo-image's real native loader never runs in jest and can't surface a 404.
 *  - `@expo/vector-icons` Ionicons → a tiny Text glyph (it otherwise pulls in
 *    expo-font → expo-asset, which is unresolvable in the jest env). Same stub
 *    the rest of the suite uses (see EmptyState.test.tsx).
 *  - `expo-linear-gradient` is already a passthrough under jest-expo (see
 *    Button.test.tsx), so it needs no mock here.
 *
 * Theme comes from the real `ThemeContext.Provider`, matching the established
 * pattern in EmptyState/Button/Skeleton tests (`withAlpha` is a pure helper and
 * runs as-is — no mock needed).
 */
import React from 'react';
import { View } from 'react-native';
import { render, fireEvent, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

// expo-image's <Image> is replaced with a host <View> that passes ALL props
// through (notably `onError`, which the component wires to `markFailed`). A
// stable `testID` lets us enumerate the rendered frames and drive each one's
// error event the way a 404 would in production.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return {
    Image: (props: any) => <RN.View testID="exercise-demo-image" {...props} />,
  };
});

// Decorative glyph only; stub to surface the icon name as text (mirrors the
// rest of the component suite).
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

import { ExerciseDemo } from '@/components/exercise/ExerciseDemo';

// A stand-in for a bundled `require(...)` placeholder image.
const FALLBACK = { testUri: 'bundled-fallback' };
const IMAGE_URL = 'https://cdn.example.com/exercise-hero.jpg';
const FRAME_A = 'https://cdn.example.com/frame-a.png';
const FRAME_B = 'https://cdn.example.com/frame-b.png';
const TUTORIAL_URL = 'https://youtube.com/watch?v=demo';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

describe('ExerciseDemo', () => {
  describe('with 2+ frames that all fail to load', () => {
    test('falls back to the still + "coming soon" once every frame fires onError', () => {
      renderWithTheme(
        <ExerciseDemo frames={[FRAME_A, FRAME_B]} imageUrl={IMAGE_URL} fallback={FALLBACK} />,
      );

      // Animated branch: it renders the looping demo, NOT the no-demo note yet.
      expect(screen.queryByText('Video demo coming soon')).toBeNull();
      // The animated player shows a "Demo" status tag.
      expect(screen.getByText('Demo')).toBeTruthy();

      // Simulate a 404 on every rendered frame <Image> (under + top). Firing the
      // same uri's error twice is harmless (markFailed de-dupes), so blanket-
      // firing across all frame nodes reliably empties the live-frame list.
      const fireAllErrors = () =>
        screen.getAllByTestId('exercise-demo-image').forEach((img) => {
          fireEvent(img, 'error');
        });
      fireAllErrors();
      // A second pass covers any frame node that only mounted after the first
      // failure shrank the list (single survivor → still 1 Image left).
      fireAllErrors();

      // Now liveFrames is empty → the no-demo branch renders the still + note.
      expect(screen.getByText('Video demo coming soon')).toBeTruthy();
      // The status "Demo" tag from the animated branch is gone.
      expect(screen.queryByText('Demo')).toBeNull();

      // The still it falls back to is the exercise's own imageUrl (not the
      // bundled fallback), wired as the Image `source`.
      const stillImages = screen.getAllByTestId('exercise-demo-image');
      const showsImageUrl = stillImages.some(
        (img) => img.props.source && img.props.source.uri === IMAGE_URL,
      );
      expect(showsImageUrl).toBe(true);
    });
  });

  describe('with no demo media (frames=null, gifUrl=null)', () => {
    test('immediately renders the still + "coming soon" copy', () => {
      renderWithTheme(
        <ExerciseDemo frames={null} gifUrl={null} imageUrl={IMAGE_URL} fallback={FALLBACK} />,
      );

      expect(screen.getByText('Video demo coming soon')).toBeTruthy();
      // No animated-loop "Demo" tag in this branch.
      expect(screen.queryByText('Demo')).toBeNull();

      // The still shows imageUrl.
      const images = screen.getAllByTestId('exercise-demo-image');
      const showsImageUrl = images.some(
        (img) => img.props.source && img.props.source.uri === IMAGE_URL,
      );
      expect(showsImageUrl).toBe(true);
    });

    test('does NOT show a "Full tutorial" link when no tutorialUrl is given', () => {
      renderWithTheme(
        <ExerciseDemo frames={null} gifUrl={null} imageUrl={IMAGE_URL} fallback={FALLBACK} />,
      );
      expect(screen.queryByText('Full tutorial')).toBeNull();
    });

    test('shows a pressable "Full tutorial" link when tutorialUrl is present', () => {
      renderWithTheme(
        <ExerciseDemo
          frames={null}
          gifUrl={null}
          imageUrl={IMAGE_URL}
          fallback={FALLBACK}
          tutorialUrl={TUTORIAL_URL}
        />,
      );

      const link = screen.getByText('Full tutorial');
      expect(link).toBeTruthy();
      // The "coming soon" note still sits alongside the tutorial link.
      expect(screen.getByText('Video demo coming soon')).toBeTruthy();
      // The link is wrapped in a Pressable exposing the link a11y role.
      expect(screen.getByLabelText('Open full tutorial')).toBeTruthy();
    });

    test('falls back to the bundled placeholder when neither frames nor imageUrl exist', () => {
      renderWithTheme(
        <ExerciseDemo frames={null} gifUrl={null} imageUrl={null} fallback={FALLBACK} />,
      );

      expect(screen.getByText('Video demo coming soon')).toBeTruthy();
      // With no imageUrl the still uses the bundled `fallback` require(...) value.
      const images = screen.getAllByTestId('exercise-demo-image');
      const usesFallback = images.some((img) => img.props.source === FALLBACK);
      expect(usesFallback).toBe(true);
    });
  });

  test('renders a non-empty player (a real View tree) in the no-demo state', () => {
    const { UNSAFE_getAllByType } = renderWithTheme(
      <ExerciseDemo frames={null} gifUrl={null} imageUrl={IMAGE_URL} fallback={FALLBACK} />,
    );
    // The wrap View + the still + the pill all mount — never an empty render.
    expect(UNSAFE_getAllByType(View).length).toBeGreaterThanOrEqual(1);
  });
});
