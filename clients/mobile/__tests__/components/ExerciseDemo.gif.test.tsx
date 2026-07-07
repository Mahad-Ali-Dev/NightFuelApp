/**
 * ExerciseDemo.gif.test.tsx
 *
 * Focused render tests for the animated-GIF / single-still demo states of
 * `src/components/exercise/ExerciseDemo.tsx`. These VERIFY already-shipped
 * behaviour — no source change accompanies them.
 *
 * The component's whole contract is "it NEVER renders an empty or broken
 * player". A curated `kind:'gif'` entry feeds a single `gifUrl` (no frame pair),
 * and there are exactly three shapes that slot can take — this file pins all
 * three so the playing-vs-still vs honest-fallback distinction can't regress:
 *
 *   1. An ANIMATED `.gif` (e.g. a Wikimedia Commons clip) with no frames →
 *      expo-image plays it natively, so the component must treat it as a PLAYING
 *      demo and show the bottom-left "Demo" pill (the `gifIsAnimated` true path).
 *   2. A single NON-gif still (a `.jpg`/`.png` gifUrl, frames null) → a labelled
 *      static still with NO "Demo" pill (we don't control playback of a still).
 *   3. A malformed / empty source (gifUrl '' or a non-resolving non-gif url,
 *      frames null) → degrades to the honest still fallback ("coming soon" copy
 *      for an empty source; a plain labelled still for a real-but-non-animated
 *      url) — never an empty or never-resolving player, and never a "Demo" pill.
 *
 * Mocks (kept minimal — mirror the established pattern in ExerciseDemo.test.tsx):
 *  - `expo-image` Image → a passthrough host <View> that forwards ALL props
 *    (notably `source` so we can read the wired uri, and `onError` so a 404 can
 *    be driven). expo-image's real native loader never runs under jest.
 *  - `@expo/vector-icons` Ionicons → a tiny Text glyph (it otherwise pulls in
 *    expo-font → expo-asset, unresolvable in the jest env).
 *  - `expo-linear-gradient` is already a passthrough under jest-expo, so it
 *    needs no mock here.
 *
 * Theme comes from the real `ThemeContext.Provider`, matching the established
 * component-suite pattern (`withAlpha` is a pure helper and runs as-is).
 */
import React from 'react';
import { View } from 'react-native';
import { render, fireEvent, screen, act } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

// expo-image's <Image> → host <View> that passes ALL props through. A stable
// `testID` lets us enumerate rendered images and read each one's `source.uri`
// (or fire its `onError` the way a 404 would in production).
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
// An already-animated clip (matches the GIF_PENDING shape in curatedDemos.ts —
// a Wikimedia Commons `.gif`). expo-image plays it natively.
const GIF_URL = 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Pushups.gif';
// A single still that is NOT animated (a plain photo). The component must NOT
// label it as a playing "Demo" — we can't control a still's playback.
const STILL_JPG_URL = 'https://cdn.example.com/single-still.jpg';
// A "malformed" curated url: not empty, but not a recognised animated source
// either (no `.gif`), standing in for a bad/unsupported entry.
const NON_GIF_URL = 'https://cdn.example.com/not-a-real-demo';

function renderWithTheme(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

// Does any rendered <Image> carry the given uri as its `source`?
const someImageHasUri = (uri: string): boolean =>
  screen.getAllByTestId('exercise-demo-image').some((img) => img.props.source && img.props.source.uri === uri);

describe('ExerciseDemo — animated .gif source (gifUrl, no frames)', () => {
  test('renders as a PLAYING demo: shows the "Demo" pill and wires the gif as the image source', () => {
    renderWithTheme(<ExerciseDemo frames={null} gifUrl={GIF_URL} imageUrl={IMAGE_URL} fallback={FALLBACK} />);

    // gifIsAnimated true path → the playing-demo "Demo" pill is present…
    expect(screen.getByText('Demo')).toBeTruthy();
    // …and the no-demo "coming soon" copy is NOT (we have a real, playing demo).
    expect(screen.queryByText('Video demo coming soon')).toBeNull();

    // The gif itself is wired as an <Image> `source.uri` so expo-image animates
    // it — not the exercise's still imageUrl.
    expect(someImageHasUri(GIF_URL)).toBe(true);
  });

  test('is a labelled image (we do not synthesise play/pause for a native gif), not an empty player', () => {
    const { UNSAFE_getAllByType } = renderWithTheme(
      <ExerciseDemo frames={null} gifUrl={GIF_URL} imageUrl={IMAGE_URL} fallback={FALLBACK} />,
    );

    // A native gif is not our cross-fade loop, so there is no play/pause toggle:
    // it stays a non-interactive "Exercise demo" image.
    expect(screen.queryByLabelText('Pause demo')).toBeNull();
    expect(screen.queryByLabelText('Resume demo')).toBeNull();
    const still = screen.getByLabelText('Exercise demo');
    expect(still.props.accessibilityRole).toBe('image');

    // A real (non-empty) View tree mounted — never a blank render.
    expect(UNSAFE_getAllByType(View).length).toBeGreaterThanOrEqual(1);
  });

  test('a 404 on the gif degrades to the honest still + "coming soon" (no broken playing pill)', () => {
    renderWithTheme(<ExerciseDemo frames={null} gifUrl={GIF_URL} imageUrl={IMAGE_URL} fallback={FALLBACK} />);

    // Initially a playing demo.
    expect(screen.getByText('Demo')).toBeTruthy();

    // The gif <Image> 404s (markFailed drops it from the live-frame list).
    act(() => {
      screen.getAllByTestId('exercise-demo-image').forEach((img) => fireEvent(img, 'error'));
    });

    // Now it falls back to the still + honest "coming soon" note, pill gone —
    // never a "Demo" pill stranded over a broken image.
    expect(screen.getByText('Video demo coming soon')).toBeTruthy();
    expect(screen.queryByText('Demo')).toBeNull();
    // The still it falls back to is the exercise's own imageUrl.
    expect(someImageHasUri(IMAGE_URL)).toBe(true);
  });
});

describe('ExerciseDemo — single NON-gif still (imageUrl set, frames null, gifUrl null)', () => {
  test('shows the still + honest "coming soon" copy and NO "Demo" pill', () => {
    renderWithTheme(<ExerciseDemo frames={null} gifUrl={null} imageUrl={IMAGE_URL} fallback={FALLBACK} />);

    // No demo media at all → honest "coming soon" state, never a playing pill.
    expect(screen.getByText('Video demo coming soon')).toBeTruthy();
    expect(screen.queryByText('Demo')).toBeNull();

    // The still shown is the exercise's own imageUrl (not the bundled fallback).
    expect(someImageHasUri(IMAGE_URL)).toBe(true);
    // It is the labelled "Exercise demo" wrap, and there is NO play/pause
    // control — the no-demo branch is never an interactive loop. (The wrap View
    // carries the label but no accessibilityRole, so we assert on the label +
    // the absence of the toggle rather than the role.)
    expect(screen.getByLabelText('Exercise demo')).toBeTruthy();
    expect(screen.queryByLabelText('Pause demo')).toBeNull();
    expect(screen.queryByLabelText('Resume demo')).toBeNull();
  });

  test('a single .jpg passed via gifUrl is a labelled still, NOT a "Demo" loop', () => {
    // A `.jpg`/`.png` gifUrl is a single real image but is NOT animated, so the
    // component renders it as a still WITHOUT the playing-demo pill (and without
    // the "coming soon" note — it IS a real demo still, just not a moving one).
    renderWithTheme(<ExerciseDemo frames={null} gifUrl={STILL_JPG_URL} imageUrl={IMAGE_URL} fallback={FALLBACK} />);

    expect(screen.queryByText('Demo')).toBeNull();
    expect(screen.queryByText('Video demo coming soon')).toBeNull();
    const still = screen.getByLabelText('Exercise demo');
    expect(still.props.accessibilityRole).toBe('image');
    // The still source is the .jpg gifUrl itself.
    expect(someImageHasUri(STILL_JPG_URL)).toBe(true);
  });
});

describe('ExerciseDemo — malformed / empty curated url degrades to the honest fallback', () => {
  test('an EMPTY gifUrl ("") with no frames renders the still + "coming soon" (no empty player)', () => {
    renderWithTheme(<ExerciseDemo frames={null} gifUrl={''} imageUrl={IMAGE_URL} fallback={FALLBACK} />);

    // An empty source is filtered out → the no-demo branch renders the honest
    // still + "coming soon" copy, never an empty/never-resolving player.
    expect(screen.getByText('Video demo coming soon')).toBeTruthy();
    expect(screen.queryByText('Demo')).toBeNull();
    // The still is the exercise's own imageUrl.
    expect(someImageHasUri(IMAGE_URL)).toBe(true);
    // Labelled "Exercise demo" wrap with no play/pause toggle — the no-demo
    // branch sets no accessibilityRole, so we assert label + absent toggle.
    expect(screen.getByLabelText('Exercise demo')).toBeTruthy();
    expect(screen.queryByLabelText('Pause demo')).toBeNull();
    expect(screen.queryByLabelText('Resume demo')).toBeNull();
  });

  test('an empty gifUrl AND no imageUrl falls back to the bundled placeholder still (never blank)', () => {
    const { UNSAFE_getAllByType } = renderWithTheme(
      <ExerciseDemo frames={null} gifUrl={''} imageUrl={null} fallback={FALLBACK} />,
    );

    expect(screen.getByText('Video demo coming soon')).toBeTruthy();
    expect(screen.queryByText('Demo')).toBeNull();
    // With neither a gif nor an imageUrl the still uses the bundled `fallback`
    // require(...) value — an honest placeholder, not an empty box.
    const usesFallback = screen
      .getAllByTestId('exercise-demo-image')
      .some((img) => img.props.source === FALLBACK);
    expect(usesFallback).toBe(true);
    // A real (non-empty) View tree mounted.
    expect(UNSAFE_getAllByType(View).length).toBeGreaterThanOrEqual(1);
  });

  test('a non-gif (unsupported) gifUrl renders a labelled still, NOT a playing "Demo" pill', () => {
    // A malformed-but-non-empty url that is NOT a recognised animated source
    // (no `.gif`). It must NOT be mislabelled as a playing demo: no "Demo" pill,
    // and the component stays a labelled still rather than a never-resolving
    // player waiting on an animation that will never start.
    renderWithTheme(<ExerciseDemo frames={null} gifUrl={NON_GIF_URL} imageUrl={IMAGE_URL} fallback={FALLBACK} />);

    expect(screen.queryByText('Demo')).toBeNull();
    const still = screen.getByLabelText('Exercise demo');
    expect(still.props.accessibilityRole).toBe('image');
    // No play/pause control is synthesised for a single still.
    expect(screen.queryByLabelText('Pause demo')).toBeNull();
    expect(screen.queryByLabelText('Resume demo')).toBeNull();
  });
});
