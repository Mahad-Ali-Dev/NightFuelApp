/**
 * socket-io-stub.js
 *
 * Empty stub returned by Metro whenever anything in the bundle tries to
 * require 'socket.io-client' or its browser-only sub-packages
 * (engine.io-client, xmlhttprequest-ssl, …).
 *
 * WHY: the mobile app replaced socket.io-client with a native WebSocket
 * wrapper (src/api/chat.ts). All remaining socket.io-client references in
 * TypeScript source files are `import type { Socket }` — erased by Babel at
 * compile time. However, the package still reaches the bundle via a
 * transitive dependency chain in the monorepo node_modules tree. Loading it
 * triggers a `ReferenceError: Property 'document' doesn't exist` on Hermes
 * because socket.io-client's browser build accesses DOM globals.
 *
 * This stub is registered in metro.config.js via resolver.resolveRequest.
 */
module.exports = {};
