/**
 * Render tests for the exercise-library grid tile, <ExerciseGridCard />.
 *
 * The tile is pure presentation: a thumbnail with a scrim, a level badge, a
 * "has demo" play chip, the name + target muscle, and an optional equipment
 * pill. The behaviour pinned here is the best-frame THUMBNAIL wiring:
 *
 *   1. It renders the `imageSource` it is handed (the caller prefers the derived
 *      best-frame poster JPG for catalog video exercises) as the thumbnail.
 *   2. When that primary source 404s/errors (a poster JPG the VPS batch hasn't
 *      generated yet), the tile's <Image> `onError` swaps in `fallbackSource`
 *      (the exercise's own imageUrl / bundled placeholder) — seamlessly, with no
 *      crash and no blank tile.
 *   3. With NO `fallbackSource`, an errored primary source is left as-is (no
 *      swap) so expo-image renders its own empty state rather than crashing.
 *
 * Mocks (mirroring the established component-suite pattern in
 * ExerciseDemo.test.tsx / LightPlanCard.test.tsx):
 *  - `expo-image` Image → a passthrough host <View> that forwards ALL props
 *    (notably `source` so we can read the wired thumbnail, and `onError` so a
 *    404 can be driven). expo-image's real native loader never runs under jest.
 *  - `@expo/vector-icons` Ionicons → a tiny <Text> glyph (it otherwise pulls in
 *    expo-font → expo-asset, unresolvable in the jest env).
 *  - `expo-linear-gradient` is already a passthrough under jest-expo (no mock).
 *  - `react-native-reanimated` runs as-is under jest-expo (FadeInDown / spring
 *    are inert in the test env); GlassCard renders its real surface.
 *
 * Theme comes from the real `ThemeContext.Provider`. The grid uses `expo-image`
 * with a single stable `testID` ("exercise-grid-image") so the thumbnail is the
 * only image queried — distinct from ExerciseDemo's "exercise-demo-image".
 */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

// expo-image's <Image> → host <View> passing ALL props through. A stable
// `testID` lets us read the wired `source` and fire `onError` like a 404 would.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return {
    Image: (props: any) => <RN.View testID="exercise-grid-image" {...props} />,
  };
});

// Decorative glyph → text glyph (mirrors the rest of the component suite).
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

import { ExerciseGridCard } from '@/components/exercise/ExerciseGridCard';

const POSTER_URI = 'https://api.zeitra.app/m/abc/chest/Male/Barbell/Bench_Press.jpg';
const IMAGE_URI = 'https://cdn.example.com/exercise-hero.jpg';
const BUNDLED_FALLBACK = 42; // a require()-number, as the screen passes for category art.

const ITEM = {
  id: 'ex-1',
  name: 'Barbell Bench Press',
  difficulty: 'intermediate',
  bodyPart: 'chest',
  equipment: 'barbell',
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

/** The thumbnail <Image> (the grid renders exactly one). */
const thumb = () => screen.getByTestId('exercise-grid-image');

describe('ExerciseGridCard — best-frame thumbnail wiring', () => {
  test('renders the supplied imageSource (the preferred poster JPG) as the thumbnail', () => {
    renderWithTheme(
      <ExerciseGridCard
        item={ITEM}
        imageSource={{ uri: POSTER_URI }}
        fallbackSource={{ uri: IMAGE_URI }}
        hasDemo
        onPress={() => {}}
      />,
    );
    expect(thumb().props.source).toEqual({ uri: POSTER_URI });
    // The exercise name still renders (nothing else regressed).
    expect(screen.getByText('Barbell Bench Press')).toBeTruthy();
  });

  test('falls back to fallbackSource when the poster JPG errors (404 before the batch finishes)', () => {
    renderWithTheme(
      <ExerciseGridCard
        item={ITEM}
        imageSource={{ uri: POSTER_URI }}
        fallbackSource={{ uri: IMAGE_URI }}
        hasDemo
        onPress={() => {}}
      />,
    );

    // Initially the preferred poster source is shown…
    expect(thumb().props.source).toEqual({ uri: POSTER_URI });

    // …then the poster 404s — the tile swaps to the fallback (imageUrl).
    fireEvent(thumb(), 'error');
    expect(thumb().props.source).toEqual({ uri: IMAGE_URI });
  });

  test('falls back to a bundled require()-number placeholder source on error', () => {
    renderWithTheme(
      <ExerciseGridCard
        item={ITEM}
        imageSource={{ uri: POSTER_URI }}
        fallbackSource={BUNDLED_FALLBACK}
        hasDemo
        onPress={() => {}}
      />,
    );
    fireEvent(thumb(), 'error');
    expect(thumb().props.source).toBe(BUNDLED_FALLBACK);
  });

  test('with NO fallbackSource, an errored primary source is left in place (no crash, no swap)', () => {
    renderWithTheme(
      <ExerciseGridCard item={ITEM} imageSource={{ uri: POSTER_URI }} hasDemo onPress={() => {}} />,
    );
    // Error with no fallback supplied — the source stays the original.
    fireEvent(thumb(), 'error');
    expect(thumb().props.source).toEqual({ uri: POSTER_URI });
  });

  test('forwards onPress (every interaction the caller wired is preserved)', () => {
    const onPress = jest.fn();
    renderWithTheme(
      <ExerciseGridCard
        item={ITEM}
        imageSource={{ uri: POSTER_URI }}
        fallbackSource={{ uri: IMAGE_URI }}
        hasDemo
        onPress={onPress}
      />,
    );
    fireEvent.press(screen.getByLabelText('Barbell Bench Press'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
