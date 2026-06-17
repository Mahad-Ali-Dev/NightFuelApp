/**
 * Reusable render harness + mock factories for the `(modals)` / `(tabs)` /
 * `(performance)` screen suites.
 *
 * Several screen tests (dashboard, calendar, active-workout, the logging
 * modals) need the SAME small set of mocks to mount a screen that imports
 * expo-router, @tanstack/react-query, the native date picker, expo-image,
 * @expo/vector-icons and react-native-safe-area-context. Until now each suite
 * re-declared those `jest.mock(...)` blocks by hand. This module factors them
 * out so a suite can wire them in two well-defined ways.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  HOW TO CONSUME — read this before importing.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * `jest.mock(moduleName, factory)` is HOISTED to the very top of the test FILE
 * it appears in (above every `import`), and `babel-plugin-jest-hoist`
 * (pulled in by babel-preset-expo under NODE_ENV=test) forbids the factory from
 * referencing any out-of-scope variable UNLESS its name matches `/^mock/i`.
 *
 * That is why every mock factory exported here is named with a `mock…`
 * prefix. A consumer calls them from inside its OWN hoisted `jest.mock`:
 *
 *   import {
 *     renderScreen,
 *     mockExpoRouterFactory,
 *     mockVectorIconsFactory,
 *     mockSafeAreaContextFactory,
 *     mockReactQueryFactory,
 *   } from '../test-utils/mock-harness';
 *
 *   jest.mock('expo-router', () => mockExpoRouterFactory());
 *   jest.mock('@expo/vector-icons', () => mockVectorIconsFactory());
 *   jest.mock('react-native-safe-area-context', () => mockSafeAreaContextFactory());
 *
 *   // react-query reads a per-file, `mock`-prefixed resolver so each test can
 *   // mutate the data it returns. The `mock` prefix is REQUIRED for the
 *   // hoisted factory to be allowed to reference it.
 *   const mockResolveQuery = jest.fn((queryKey: readonly unknown[]) => ({ … }));
 *   jest.mock('@tanstack/react-query', () =>
 *     mockReactQueryFactory(() => mockResolveQuery),
 *   );
 *
 *   import MyScreen from '../../app/(modals)/my-screen';
 *   // … renderScreen(<MyScreen />) …
 *
 * The factories require `react-native` lazily (inside the function body) — they
 * are only ever invoked the first time Jest resolves the mocked module, which
 * happens AFTER hoisting, so `react-native` is safe to require there. They take
 * no closures over module scope, so they are safe to call from a hoisted
 * factory regardless of the consumer's variable names.
 *
 * `renderScreen` is a plain runtime helper (no hoisting concerns) — import and
 * call it directly. It mirrors the `renderWithTheme` wrapper used across the
 * component suites so screens get the real dark ThemeContext.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import {
  ThemeContext,
  getThemeColors,
  typography,
  spacing,
  borderRadius,
  shadows,
} from '@/theme';

// ── Render helper ────────────────────────────────────────────────────────────

/**
 * Render `ui` inside the real dark `ThemeContext.Provider` (the same value the
 * app boots with). Screens call `useTheme()` which reads this context, so every
 * theme token resolves to a concrete value during the test. Returns the full
 * RNTL result; suites typically use the module-level `screen` query API.
 */
export function renderScreen(ui: React.ReactElement) {
  return render(
    <ThemeContext.Provider
      value={{ scheme: 'dark', colors: getThemeColors('dark'), typography, spacing, borderRadius, shadows }}
    >
      {ui}
    </ThemeContext.Provider>,
  );
}

// ── Mock factories (call from inside the consumer's `jest.mock`) ───────────────

/**
 * expo-router stub: `useRouter` (push/replace/back/setParams spies),
 * `usePathname` and `useLocalSearchParams`. Pass `overrides` to swap any of
 * them (e.g. a shared `back` spy you assert on). Fresh `jest.fn()`s are created
 * per call so suites don't accidentally share spy state.
 */
export function mockExpoRouterFactory(
  overrides: Partial<{
    useRouter: () => unknown;
    usePathname: () => string;
    useLocalSearchParams: () => Record<string, unknown>;
  }> = {},
) {
  return {
    useRouter:
      overrides.useRouter ??
      (() => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn() })),
    usePathname: overrides.usePathname ?? (() => '/'),
    useLocalSearchParams: overrides.useLocalSearchParams ?? (() => ({})),
  };
}

/**
 * @react-native-community/datetimepicker → a passthrough host `<View>` (default
 * export). We never open the real native picker in these guards; the stub just
 * keeps the screens that mount a `DateTimeField` importable. Matches the stub
 * the DateTimeField/a11y suites already use.
 */
export function mockDateTimePickerFactory() {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => <View {...props} />,
  };
}

/**
 * expo-image → a passthrough host `<View>` that forwards every prop (notably
 * `source` and `onError`) and carries `testID="exercise-demo-image"` so the
 * ExerciseDemo frame assertions keep working. The native loader never runs
 * under jest, so this is the only way frames/stills are observable.
 */
export function mockExpoImageFactory() {
  const RN = require('react-native');
  return {
    Image: (props: any) => <RN.View testID="exercise-demo-image" {...props} />,
  };
}

/**
 * @expo/vector-icons → decorative glyphs only. `Ionicons` renders its `name` as
 * plain text (`icon:<name>`) so it is both assertable and free of the
 * expo-font → expo-asset chain that is unresolvable under jest.
 */
export function mockVectorIconsFactory() {
  const { Text: RNText } = require('react-native');
  return {
    Ionicons: ({ name }: { name?: string }) => <RNText>{`icon:${name ?? ''}`}</RNText>,
  };
}

/**
 * react-native-safe-area-context → deterministic insets so a screen lays out
 * without the native provider. Pass custom insets if a test needs them.
 */
export function mockSafeAreaContextFactory(
  insets: { top: number; bottom: number; left: number; right: number } = {
    top: 44,
    bottom: 34,
    left: 0,
    right: 0,
  },
) {
  return {
    useSafeAreaInsets: () => insets,
  };
}

/**
 * Result shape every stubbed `useQuery` returns. Mirrors the slice of
 * @tanstack/react-query v5's `UseQueryResult` the screens read.
 */
export interface HarnessQueryResult {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
}

/** Resolver: given a query's `queryKey`, return the result that query yields. */
export type QueryResolver = (queryKey: readonly unknown[]) => HarnessQueryResult;

/** Slice of `UseMutationResult` the logging modals read off `useMutation()`. */
export interface HarnessMutationResult {
  mutate: (...args: unknown[]) => unknown;
  isPending: boolean;
}

/**
 * @tanstack/react-query stub. Screens here only touch `useQuery`,
 * `useMutation` and `useQueryClient`, so we stub exactly those.
 *
 * `getResolver` is a thunk evaluated on EVERY `useQuery` call. Returning the
 * resolver lazily (rather than capturing it once) lets a suite mutate a
 * `mock`-prefixed state object between renders and have the next render pick up
 * the change — the pattern the dashboard/calendar/active-workout suites use.
 *
 * `getMutationState` is an optional thunk for the mutation slice (defaults to an
 * idle, never-pending mutation). Returning it lazily lets a suite flip
 * `isPending` to exercise the "Saving …" label branch.
 *
 * A default no-op `useQueryClient` (with an `invalidateQueries` spy) is provided
 * because the logging modals construct one at the top of render.
 */
export function mockReactQueryFactory(
  getResolver: () => QueryResolver,
  getMutationState: () => HarnessMutationResult = () => ({ mutate: jest.fn(), isPending: false }),
) {
  return {
    useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => getResolver()(queryKey),
    useMutation: () => getMutationState(),
    useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  };
}

/**
 * Convenience: build a `QueryResolver` from a `queryKey[0]` → result map. Keys
 * not present fall through to an idle, empty result (the same benign default
 * the sibling suites return for unrelated queries). Use this when a screen
 * fires several queries but a test only cares about one or two.
 */
export function resolverFromMap(
  map: Record<string, HarnessQueryResult>,
): QueryResolver {
  return (queryKey) => {
    const key = String(queryKey[0]);
    return (
      map[key] ?? { data: undefined, isLoading: false, isError: false, refetch: jest.fn() }
    );
  };
}
