/**
 * Hand-rolled jest mock for react-native-reanimated (v4) — worklets-free.
 *
 * WHY THIS EXISTS
 * Reanimated 4 eagerly pulls in react-native-worklets, whose NATIVE part isn't
 * initialized under jest — so importing the real package (or reanimated's OWN
 * shipped `react-native-reanimated/mock`, whose src/mock.ts imports runtime
 * values from ./index) throws:
 *   "WorkletsError: [Worklets] Native part of Worklets doesn't seem to be
 *    initialized"
 * which fails EVERY suite that renders a reanimated-importing component (chiefly
 * `src/components/ui/PressableScale.tsx`, and therefore ~40 suites transitively).
 *
 * This module has ZERO worklets dependency and covers exactly the API surface the
 * app imports:
 *   - Animated.* components render as their plain RN counterparts (animation-only
 *     props are dropped);
 *   - hooks return inert-but-consistent shared values / computed styles so
 *     components still lay out;
 *   - animation helpers (withTiming/withSpring/…) resolve to their target value;
 *   - interpolate/runOnJS are identity/synchronous;
 *   - entering/exiting/layout builders (FadeInDown.duration(x).springify()…) are
 *     chainable no-ops.
 *
 * WIRING (see jest.config.js + <rootDir>/__mocks__/react-native-reanimated.js)
 *   - <rootDir>/__mocks__/react-native-reanimated.js re-exports THIS file, so the
 *     bare `react-native-reanimated` import is auto-mocked in every suite.
 *   - jest.config moduleNameMapper redirects `react-native-reanimated/mock`
 *     (used by the 7 suites that do
 *      jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock')))
 *     to THIS file too — replacing reanimated's broken shipped mock. The redirect
 *     MUST target this file and NOT the __mocks__ file: pointing /mock at the
 *     manual-mock file makes the jest.mock factory re-resolve to itself →
 *     "RangeError: Maximum call stack size exceeded".
 */
const React = require('react');
const RN = require('react-native');

// Animated.<Component> → the plain RN component, dropping animation-only props
// (entering/exiting/layout/sharedTransitionTag) and flattening animatedProps.
function animated(Base) {
  const Comp = React.forwardRef(function AnimatedMock(props, ref) {
    const p = props || {};
    const { entering, exiting, layout, sharedTransitionTag, animatedProps, children, ...rest } = p;
    return React.createElement(Base, Object.assign({}, rest, animatedProps, { ref }), children);
  });
  Comp.displayName = 'Animated(Mock)';
  return Comp;
}

const createAnimatedComponent = (Base) => animated(Base);

const Animated = {
  View: animated(RN.View),
  Text: animated(RN.Text),
  ScrollView: animated(RN.ScrollView),
  Image: animated(RN.Image),
  FlatList: animated(RN.FlatList),
  createAnimatedComponent,
};

// Chainable no-op for the entering/exiting/layout builder DSL, e.g.
// FadeInDown.duration(420).delay(60).springify().damping(18). Every access
// returns a function that yields the same proxy, so any chain resolves to an
// inert value that the animated() components above simply ignore.
function chainable() {
  const proxy = new Proxy(function () {}, {
    get(_t, prop) {
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'build') return () => ({});
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}

// ── Hooks ────────────────────────────────────────────────────────────────────
function useSharedValue(initial) {
  const ref = React.useRef({ value: initial });
  return ref.current;
}
function useDerivedValue(fn) {
  try {
    return { value: typeof fn === 'function' ? fn() : undefined };
  } catch {
    return { value: undefined };
  }
}
function useAnimatedStyle(fn) {
  try {
    return typeof fn === 'function' ? fn() || {} : {};
  } catch {
    return {};
  }
}
function useAnimatedProps(fn) {
  try {
    return typeof fn === 'function' ? fn() || {} : {};
  } catch {
    return {};
  }
}
const useAnimatedRef = () => React.useRef(null);
const useAnimatedScrollHandler = () => () => {};
const useAnimatedReaction = () => {};

// ── Animation helpers → resolve to the target value / no-op ──────────────────
const withTiming = (v) => v;
const withSpring = (v) => v;
const withDecay = () => 0;
const withDelay = (_ms, v) => v;
const withRepeat = (v) => v;
const withSequence = (...vs) => (vs.length ? vs[vs.length - 1] : undefined);
const cancelAnimation = () => {};

// ── Interpolation ────────────────────────────────────────────────────────────
const interpolate = (v) => v;
const interpolateColor = (_v, _in, out) =>
  Array.isArray(out) && out.length ? out[0] : 'rgba(0,0,0,1)';
const Extrapolation = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' };
const Extrapolate = Extrapolation;

// ── Thread hops → run synchronously on the JS thread ─────────────────────────
const runOnJS = (fn) => (...args) => (typeof fn === 'function' ? fn(...args) : undefined);
const runOnUI = (fn) => (...args) => (typeof fn === 'function' ? fn(...args) : undefined);

// ── Easing → every member is a forgiving identity easing ─────────────────────
const identityEasing = (t) => t;
const Easing = new Proxy(
  {},
  { get: () => (...args) => (typeof args[0] === 'function' ? args[0] : identityEasing) },
);

module.exports = {
  __esModule: true,
  default: Animated,
  createAnimatedComponent,

  // hooks
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedReaction,

  // animation helpers
  withTiming,
  withSpring,
  withDecay,
  withDelay,
  withRepeat,
  withSequence,
  cancelAnimation,

  // interpolation
  interpolate,
  interpolateColor,
  Extrapolation,
  Extrapolate,

  // thread hops + easing
  runOnJS,
  runOnUI,
  Easing,

  // entering / exiting / layout builders (chainable no-ops)
  FadeIn: chainable(),
  FadeInDown: chainable(),
  FadeInUp: chainable(),
  FadeInLeft: chainable(),
  FadeInRight: chainable(),
  FadeOut: chainable(),
  FadeOutUp: chainable(),
  FadeOutDown: chainable(),
  SlideInDown: chainable(),
  SlideInUp: chainable(),
  SlideInLeft: chainable(),
  SlideInRight: chainable(),
  SlideOutUp: chainable(),
  SlideOutDown: chainable(),
  ZoomIn: chainable(),
  ZoomOut: chainable(),
  Layout: chainable(),
  LinearTransition: chainable(),
};
