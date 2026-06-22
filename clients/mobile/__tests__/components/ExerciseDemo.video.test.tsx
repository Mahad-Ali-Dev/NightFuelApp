/**
 * Render tests for the self-hosted MP4 demo path in the ExerciseDemo "player".
 *
 * ExerciseDemo gained a gate-safe `videoUrl` path: when a `videoUrl` is present
 * AND the expo-video seam (`@/lib/exerciseVideo`) reports the native engine
 * available, it streams the clip via the seam's player component INSTEAD of the
 * image-frame loop. When the seam is unavailable (Expo Go / the jest gate /
 * package not installed) — i.e. `getExerciseVideoComponent()` returns null — or
 * no `videoUrl` is supplied, it falls back to the EXISTING image-frame / gif /
 * still / "coming soon" behaviour unchanged.
 *
 * The two behaviours pinned down here:
 *
 *   1. videoUrl + seam AVAILABLE → the (mocked) video player renders, identified
 *      by a stable testID the mock player exposes. The image-frame "coming soon"
 *      copy is NOT shown (a real demo is playing).
 *   2. videoUrl + seam UNAVAILABLE (the real gate default) → the video player is
 *      NOT rendered and the EXISTING image path renders exactly as before
 *      (imageUrl still + "Video demo coming soon").
 *   3. NO videoUrl, regardless of seam → the existing image path renders (the
 *      video branch is never entered).
 *
 * The seam is mocked rather than the native package: this is the SAME seam the
 * production UI imports, so toggling `getExerciseVideoComponent`'s return value
 * exercises the exact branch the gate-safe wiring takes — WITHOUT ever loading
 * expo-video (which isn't installed for the gate). Other mocks (expo-image →
 * passthrough View, Ionicons → text glyph, real ThemeContext) mirror the sibling
 * ExerciseDemo.test.tsx.
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

// The expo-video seam is mocked so we can flip native-engine availability per
// test. `getExerciseVideoComponent` is a jest.fn whose return value each test
// sets: a stub player component (engine available) or null (the gate default).
jest.mock('@/lib/exerciseVideo', () => ({
  getExerciseVideoComponent: jest.fn(),
}));

// expo-image's <Image> → a host <View> passing all props through (matches the
// sibling ExerciseDemo.test.tsx), so the image-frame fallback path renders and
// is enumerable.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return {
    Image: (props: any) => <RN.View testID="exercise-demo-image" {...props} />,
  };
});

// Decorative glyph → text, mirroring the sibling suite.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

import { ExerciseDemo } from '@/components/exercise/ExerciseDemo';
import { getExerciseVideoComponent } from '@/lib/exerciseVideo';

const mockGetVideoComponent = getExerciseVideoComponent as jest.MockedFunction<
  typeof getExerciseVideoComponent
>;

const FALLBACK = { testUri: 'bundled-fallback' };
const IMAGE_URL = 'https://cdn.example.com/exercise-hero.jpg';
const VIDEO_URL = 'https://cdn.example.com/demos/bench.mp4';

// A stand-in for the seam's real expo-video player. Renders a host View carrying
// a stable testID + the uri it was handed, so the test can assert BOTH that the
// video path was taken and that the correct uri flowed through.
const MockVideoPlayer = ({ uri }: { uri: string }) => {
  const RN = require('react-native');
  return <RN.View testID="exercise-demo-video" data-uri={uri} />;
};

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('ExerciseDemo — self-hosted MP4 video path (gate-safe seam)', () => {
  describe('videoUrl present AND seam available (native engine present)', () => {
    beforeEach(() => {
      mockGetVideoComponent.mockReturnValue(MockVideoPlayer as any);
    });

    test('renders the (mocked) video player instead of the image-frame path', () => {
      renderWithTheme(
        <ExerciseDemo videoUrl={VIDEO_URL} imageUrl={IMAGE_URL} fallback={FALLBACK} />,
      );

      // The video player rendered…
      const player = screen.getByTestId('exercise-demo-video');
      expect(player).toBeTruthy();
      // …with the supplied uri forwarded to it.
      expect(player.props['data-uri']).toBe(VIDEO_URL);

      // The "Demo" status pill labels it as a playing demo.
      expect(screen.getByText('Demo')).toBeTruthy();
      // The image-frame "coming soon" fallback is NOT shown — a real demo plays.
      expect(screen.queryByText('Video demo coming soon')).toBeNull();
      // No image-frame <Image> is rendered in the video branch.
      expect(screen.queryByTestId('exercise-demo-image')).toBeNull();
    });

    test('a whitespace-only videoUrl is ignored — falls back to the image path', () => {
      renderWithTheme(
        <ExerciseDemo videoUrl="   " frames={null} gifUrl={null} imageUrl={IMAGE_URL} fallback={FALLBACK} />,
      );

      // Blank uri → video branch not entered, existing no-demo still renders.
      expect(screen.queryByTestId('exercise-demo-video')).toBeNull();
      expect(screen.getByText('Video demo coming soon')).toBeTruthy();
    });
  });

  describe('videoUrl present but seam UNAVAILABLE (the gate / Expo Go default)', () => {
    beforeEach(() => {
      // The real gate condition: expo-video isn't installed → seam returns null.
      mockGetVideoComponent.mockReturnValue(null);
    });

    test('does NOT render the video player and keeps the existing image path', () => {
      renderWithTheme(
        <ExerciseDemo videoUrl={VIDEO_URL} frames={null} gifUrl={null} imageUrl={IMAGE_URL} fallback={FALLBACK} />,
      );

      // No video player when the native engine is unavailable…
      expect(screen.queryByTestId('exercise-demo-video')).toBeNull();
      // …and the EXISTING image path renders unchanged (still + "coming soon").
      expect(screen.getByText('Video demo coming soon')).toBeTruthy();
      const images = screen.getAllByTestId('exercise-demo-image');
      const showsImageUrl = images.some((img) => img.props.source?.uri === IMAGE_URL);
      expect(showsImageUrl).toBe(true);
    });
  });

  describe('no videoUrl — the video branch is never entered', () => {
    test('with seam available but no videoUrl, the existing image path renders', () => {
      mockGetVideoComponent.mockReturnValue(MockVideoPlayer as any);

      renderWithTheme(
        <ExerciseDemo frames={null} gifUrl={null} imageUrl={IMAGE_URL} fallback={FALLBACK} />,
      );

      // No uri → the seam is not even consulted for a component; image path renders.
      expect(screen.queryByTestId('exercise-demo-video')).toBeNull();
      expect(screen.getByText('Video demo coming soon')).toBeTruthy();
    });

    test('the animated image-frame loop still works when no videoUrl is given', () => {
      mockGetVideoComponent.mockReturnValue(null);
      const FRAME_A = 'https://cdn.example.com/frame-a.png';
      const FRAME_B = 'https://cdn.example.com/frame-b.png';

      renderWithTheme(
        <ExerciseDemo frames={[FRAME_A, FRAME_B]} imageUrl={IMAGE_URL} fallback={FALLBACK} />,
      );

      // The animated loop renders its "Demo" pill, NOT the video player.
      expect(screen.queryByTestId('exercise-demo-video')).toBeNull();
      expect(screen.getByText('Demo')).toBeTruthy();
      expect(screen.getAllByTestId('exercise-demo-image').length).toBeGreaterThan(0);
    });
  });
});
