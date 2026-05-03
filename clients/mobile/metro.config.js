const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// ---------------------------------------------------------------------------
// Block browser-only packages that access DOM globals (document, window, …).
//
// socket.io-client and its sub-packages (engine.io-client, xmlhttprequest-ssl)
// are pulled into the bundle via the monorepo node_modules resolution chain.
// Their browser builds call `document.xxx` which throws
// `ReferenceError: Property 'document' doesn't exist` on Hermes.
//
// The mobile app uses a native WebSocket wrapper (src/api/chat.ts) instead,
// so these packages are safe to stub out completely.
// ---------------------------------------------------------------------------
const SOCKET_IO_STUB = path.resolve(projectRoot, 'src/mocks/socket-io-stub.js');

const BLOCKED_PACKAGES = new Set([
  'socket.io-client',
  'engine.io-client',
  'engine.io-parser',
  'xmlhttprequest-ssl',
  'socket.io-parser',
  '@socket.io/component-emitter',
]);

// Custom resolveRequest removed to prevent Metro HMR crashes
// ---------------------------------------------------------------------------
// Global browser polyfills — injected BEFORE every other module.
//
// Some packages in the monorepo dependency tree access browser globals
// (document, window, localStorage, …) at module scope during require().
// On Hermes those globals don't exist and the access throws
// `ReferenceError: Property 'document' doesn't exist`, which propagates
// into React's render cycle and surfaces as the "Something went wrong"
// ErrorBoundary screen.
//
// polyfillModuleNames files run before the bundle entry point, so the stubs
// are in place before any library module is evaluated.
// ---------------------------------------------------------------------------
// Direct property mutation avoids clobbering non-enumerable / getter-based
// properties that getDefaultConfig() may have attached to config.serializer.
// Spreading the object (config.serializer = { ...config.serializer, … }) drops
// those and can cause Metro's internal HMR / bundle-serving logic to fail.
if (!config.serializer) config.serializer = {};
config.serializer.polyfillModuleNames = [
  ...(config.serializer.polyfillModuleNames ?? []),
  path.resolve(projectRoot, 'src/polyfills/browser-globals.js'),
];

module.exports = config;
