/**
 * Jest configuration for NightFuel mobile.
 *
 * Uses jest-expo preset for the right Babel + transform setup. Component
 * tests live in __tests__/components, pure-function tests live in
 * __tests__/lib and __tests__/utils.
 */
module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.expo/',
    '<rootDir>/android/',
    '<rootDir>/ios/',
    // Shared render harness + mock factories imported BY the suites — not a
    // suite itself. jest-expo's default testMatch would otherwise run any
    // file under __tests__ and fail it for containing no tests.
    '<rootDir>/__tests__/test-utils/',
  ],
  // jest-expo's default transformIgnorePatterns whitelists Expo packages.
  // We extend it to also pass through @sentry/react-native (which ships
  // ESM that needs Babel transform) and @nightfuel/* workspace packages
  // (e.g. @nightfuel/dates) whose `main` points at raw TypeScript source —
  // those must be Babel-transformed rather than required as-is.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@sentry/.*|@nightfuel/.*))',
  ],
  moduleNameMapper: (() => {
    const END = String.fromCharCode(36); // literal end-of-string anchor for the regex
    return {
      // Voice native packages (expo-speech / expo-speech-recognition) are
      // declared in package.json for the EAS build but NOT installed for the
      // gate. jest eagerly resolves the lazy `require('./voice.native')` in
      // src/lib/voice.ts, so without these stubs the resolver would fail the
      // suite. The stubs report TTS/STT unavailable → getVoiceAdapter() falls
      // back to the honest no-op (the gate/Expo-Go behaviour). Keeps the gate
      // green with NO `npm install` of native deps. (The `@/` mapper must come
      // AFTER these so the more specific package names match first.)
      [`^expo-speech-recognition${END}`]: '<rootDir>/src/mocks/expo-speech-recognition-stub.js',
      [`^expo-speech${END}`]: '<rootDir>/src/mocks/expo-speech-stub.js',
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
