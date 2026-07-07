/**
 * Render + interaction tests for the rebuilt Train / "Workouts" screen
 * (`app/(tabs)/training.tsx`).
 *
 * The screen was rebuilt 1:1 from the `train-preview.html` mockup: a header
 * (search button · "Workouts" · avatar), a "Workout of the Day" WodCarousel, the
 * "Browse by style" interlocking bento, and a "Target a muscle group" carousel.
 * The previous TRAIN/PLAN switcher, stat row, routines carousel and "My Plan"
 * tab were dropped, so these tests pin the new structure + navigation instead.
 *
 * Mocks (minimal — heavy full-screen):
 *  - `@tanstack/react-query` useQuery → a controllable active-session result
 *    (`mockSessionData`); everything else benign-empty.
 *  - `./_layout` → only re-exports TAB_BAR_H.
 *  - `expo-router` (useRouter push spy / useFocusEffect), `@expo/vector-icons`,
 *    `react-native-safe-area-context`, `@/api/exercises`, `@/store/authStore`.
 *  - WodCarousel / BentoBrowse / MuscleCard render for real (they pass through
 *    jest-expo, as in the prior revision of this suite).
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

// expo-router push spy + a mutable active-session holder (mock-prefixed so the
// hoisted jest.mock factories may close over them).
const mockPush = jest.fn();
let mockSessionData: any = undefined;

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'active-session') {
      return { data: mockSessionData, isLoading: false, isError: false, refetch: jest.fn() };
    }
    return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
  },
}));

jest.mock('../../app/(tabs)/_layout', () => ({ TAB_BAR_H: 72 }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const cleanup = cb();
    if (typeof cleanup === 'function') cleanup();
  },
}));

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText> };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('@/api/exercises', () => ({ getActiveSession: jest.fn(), getRoutines: jest.fn() }));
jest.mock('@/store/authStore', () => ({ useAuthStore: () => ({ user: { name: 'Alex' } }) }));

// Import AFTER the mocks are registered.
import TrainingHubScreen from '../../app/(tabs)/training';

function renderScreen() {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      <TrainingHubScreen />
    </ThemeContext.Provider>,
  );
}

describe('TrainingHubScreen — rebuilt "Workouts" screen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSessionData = undefined;
  });

  test('renders the header title + all three section headings', () => {
    renderScreen();
    expect(screen.getByText('Workouts')).toBeTruthy();
    expect(screen.getByText('Workout of the Day')).toBeTruthy();
    expect(screen.getByText('Browse by style')).toBeTruthy();
    expect(screen.getByText('Target a muscle group')).toBeTruthy();
  });

  test('the search button opens the exercise library', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Search exercises'));
    expect(mockPush).toHaveBeenCalledWith('/(exercises)');
  });

  test('the avatar opens the profile', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Profile'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/profile');
  });

  test('the "Browse" link opens the guided exercise flow', () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Browse exercises by muscle'));
    expect(mockPush).toHaveBeenCalledWith('/(exercises)/gender');
  });

  describe('active-session resume banner', () => {
    test('is hidden when no session is live', () => {
      renderScreen();
      expect(screen.queryByText('Session in progress')).toBeNull();
    });

    test('shows and resumes the workout when a session is live', () => {
      mockSessionData = { id: 's1', startedAt: '2026-06-27T00:00:00.000Z', endedAt: null };
      renderScreen();
      expect(screen.getByText('Session in progress')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('Session in progress, resume'));
      expect(mockPush).toHaveBeenCalledWith('/training/workout');
    });
  });
});
