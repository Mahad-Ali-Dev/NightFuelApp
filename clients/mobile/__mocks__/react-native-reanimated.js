/**
 * Automatic jest manual mock for the `react-native-reanimated` package.
 *
 * As a node_modules manual mock at <rootDir>/__mocks__, jest applies this to
 * every suite that imports `react-native-reanimated` WITHOUT its own jest.mock.
 * The real implementation lives in src/mocks/reanimated-mock.js (shared with the
 * `react-native-reanimated/mock` moduleNameMapper redirect in jest.config.js);
 * this file is a thin re-export so there is a single source of truth.
 *
 * IMPORTANT: the redirect for `react-native-reanimated/mock` in jest.config MUST
 * point at src/mocks/reanimated-mock.js, NOT at this file — pointing it here makes
 * the `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))`
 * factory re-resolve to itself → "RangeError: Maximum call stack size exceeded".
 */
module.exports = require('../src/mocks/reanimated-mock.js');
