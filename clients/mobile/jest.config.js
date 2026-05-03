/**
 * Jest configuration for NightFuel mobile.
 *
 * Uses jest-expo preset for the right Babel + transform setup. Component
 * tests live in __tests__/components, pure-function tests live in
 * __tests__/lib and __tests__/utils.
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEach: [],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.expo/',
    '<rootDir>/android/',
    '<rootDir>/ios/',
  ],
  // jest-expo's default transformIgnorePatterns whitelists Expo packages.
  // We extend it to also pass through @sentry/react-native (which ships
  // ESM that needs Babel transform).
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@sentry/.*))',
  ],
  moduleNameMapper: (() => {
    const END = String.fromCharCode(36); // literal end-of-string anchor for the regex
    return {
      [`^@/(.*)${END}`]: '<rootDir>/src/$1',
    };
  })(),
  collectCoverageFrom: [
    'src/lib/**/*.{ts,tsx}',
    'src/utils/**/*.{ts,tsx}',
    'src/hooks/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
};
