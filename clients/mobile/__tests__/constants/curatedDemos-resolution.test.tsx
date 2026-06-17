/**
 * curatedDemos-resolution.test.tsx
 *
 * Pins down the new resolution wiring from sprint 6:
 *
 *   - `getCuratedDemoFrames(name)` — typed string[] accessor that hides the
 *     pipe-joined `0.jpg|1.jpg` storage shape behind a ready-to-use ordered
 *     start→end frame pair (or null when the entry is not `fedb_frames`).
 *   - `getCuratedDemoVerified(name)` — typed boolean accessor returning the
 *     curated entry's `verified` flag (or null when no entry exists).
 *   - the exercise-detail screen's combined precedence + "Unreviewed" chip
 *     (rendered when an exercise's curated entry is `verified: false`).
 *
 * The first five cases are pure data assertions against the real curated map
 * — no React, no network. The sixth mounts <ExerciseDetailScreen/> with a
 * minimal `useQuery` stub and asserts the chip is present for a verified:false
 * exercise. The screen-side jest.mock calls below are hoisted by jest, so they
 * apply to ALL tests in the file even though the data tests don't import the
 * mocked modules.
 */

// ── jest.mock hoisting block ─────────────────────────────────────────────────
// All `jest.mock` calls below are hoisted ABOVE the imports, so they take
// effect for every import in the file. The data-accessor tests don't touch
// any of these mocked modules, so the mocks are harmless to them.

// react-query: drive the exercise-detail query to return a known curated name.
// Front Barbell Squat is a fedb_frames entry (verified:false), so the chip
// MUST render. The analytics query stays in a benign "no data" state since the
// 'progress' tab isn't active by default.
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'exercise-detail') {
      return {
        data: {
          id: 'fbs-1',
          name: 'Front Barbell Squat',
          muscleGroup: 'legs',
          equipment: 'Barbell',
          difficulty: 'Intermediate',
          instructions: '',
          imageUrl: null,
          bodyPart: 'upper legs',
        },
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    }
    // exercise-analytics + anything else — benign empty success.
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
}));

// The API module is statically imported by the screen; stub the two named
// exports so the real axios client never loads. useQuery is mocked above so
// these are never actually invoked — they just need to be importable.
jest.mock('@/api/exercises', () => ({
  getById: jest.fn(),
  getAnalytics: jest.fn(),
}));

// expo-router: stub the two hooks the screen uses. The :id param feeds the
// exercise-detail query (mocked above) so any non-empty string works.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'fbs-1' }),
}));

// Decorative glyphs — stub to surface the icon name as text (mirrors the rest
// of the component suite). Otherwise pulls in expo-font → expo-asset.
jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
});

// Deterministic insets so the screen lays out without the native provider.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// expo-image's <Image> uses a native loader; replace it with a passthrough View
// so the demo player mounts without crashing on the jest renderer.
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return { Image: (props: any) => <RN.View {...props} /> };
});

// react-native-gifted-charts ships a native dep; stub LineChart to a host view.
jest.mock('react-native-gifted-charts', () => {
  const RN = require('react-native');
  return { LineChart: (props: any) => <RN.View testID="line-chart-stub" {...props} /> };
});

// ── Imports (run AFTER the hoisted mocks above) ──────────────────────────────
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
import { getCuratedDemoFrames, getCuratedDemoVerified } from '@/constants/curatedDemos';
import ExerciseDetailScreen from '../../app/(exercises)/[id]';

// ── Pure data accessor tests ─────────────────────────────────────────────────
// These tests don't need React Native; they exercise the curated-map module
// directly. They run alongside the render test, but only touch pure data.

describe('getCuratedDemoFrames — typed string[] accessor', () => {
  test('returns null for a YouTube entry (kind:"youtube")', () => {
    // 'Barbell Bench Press' is a grandfathered DEMO_FALLBACK entry with
    // kind:'youtube'; the typed-frames accessor must NOT return its watch URL
    // split on the (absent) pipe — only fedb_frames entries are surfaced.
    expect(getCuratedDemoFrames('Barbell Bench Press')).toBeNull();
  });

  test('returns a 2-element string[] of HTTPS URLs for a fedb_frames entry', () => {
    // 'Front Barbell Squat' is in FEDB_BACKED_SLUGS — kind:'fedb_frames',
    // url:'https://.../0.jpg|https://.../1.jpg'. The accessor must split on '|'
    // and surface a ready-to-use [start, end] ordered pair.
    const frames = getCuratedDemoFrames('Front Barbell Squat');
    expect(frames).not.toBeNull();
    expect(frames!.length).toBe(2);
    expect(frames![0]).toMatch(/^https:\/\//);
    expect(frames![1]).toMatch(/^https:\/\//);
    // The pair must be ORDERED: 0.jpg precedes 1.jpg so the in-app loop
    // animates start → end of the rep.
    expect(frames![0]!.endsWith('/0.jpg')).toBe(true);
    expect(frames![1]!.endsWith('/1.jpg')).toBe(true);
  });

  test('returns null for an unknown exercise name', () => {
    expect(getCuratedDemoFrames('Made Up Movement 9000')).toBeNull();
    expect(getCuratedDemoFrames('')).toBeNull();
  });

  test('is case-insensitive and whitespace-trimmed (delegates to getCuratedDemo)', () => {
    // Same lookup semantics as getCuratedDemo — proven by equality.
    const a = getCuratedDemoFrames('  front BARBELL squat ');
    const b = getCuratedDemoFrames('Front Barbell Squat');
    expect(a).toEqual(b);
  });
});

describe('getCuratedDemoVerified — typed boolean accessor', () => {
  test('returns true for a grandfathered (verified) YouTube entry', () => {
    // Barbell Bench Press is one of the 35 grandfathered DEMO_FALLBACK names
    // that always carry verified:true.
    expect(getCuratedDemoVerified('Barbell Bench Press')).toBe(true);
  });

  test('returns false for a new YouTube entry awaiting human review', () => {
    // Reverse Kegel is in YOUTUBE_PENDING — kind:'youtube', verified:false.
    expect(getCuratedDemoVerified('Reverse Kegel')).toBe(false);
  });

  test('returns false for a FEDB-backed entry (all FEDB_BACKED ship verified:false)', () => {
    // Front Barbell Squat is a fedb_frames entry — verified:false by design.
    expect(getCuratedDemoVerified('Front Barbell Squat')).toBe(false);
  });

  test('returns null for an unknown name', () => {
    expect(getCuratedDemoVerified('Made Up Name')).toBeNull();
    expect(getCuratedDemoVerified('')).toBeNull();
  });
});

// ── Screen render test: the "Unreviewed" chip ────────────────────────────────

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <ExerciseDetailScreen />
    </ThemeContext.Provider>,
  );
}

describe('ExerciseDetailScreen — Unreviewed chip', () => {
  test('renders the chip for a curated, verified:false exercise (Front Barbell Squat)', () => {
    renderScreen();

    // Front Barbell Squat is a fedb_frames entry (verified:false) → chip MUST
    // render with the exact "Unreviewed" copy.
    expect(screen.getByText('Unreviewed')).toBeTruthy();
    // The chip's accessibility label is the long-form explanation.
    expect(screen.getByLabelText('Demo not yet human-reviewed')).toBeTruthy();
  });
});
