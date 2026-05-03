/**
 * browser-globals.js
 *
 * Injected by Metro BEFORE any application or library module is evaluated
 * (via config.serializer.polyfillModuleNames in metro.config.js).
 *
 * Purpose: some packages bundled in the monorepo node_modules tree assume a
 * browser environment and access DOM globals (document, window, …) at module
 * scope — i.e. during the require() call itself, not inside a function. On
 * Hermes those accesses throw `ReferenceError: Property '<name>' doesn't
 * exist` because the globals simply don't exist. This polyfill creates minimal
 * no-op stubs so the require() succeeds without the crash.
 *
 * Nothing here actually does DOM work — it only prevents the ReferenceError.
 */
'use strict';

// ─── document ────────────────────────────────────────────────────────────────
if (typeof document === 'undefined') {
  var noop = function () {};
  var nullEl = { style: {}, setAttribute: noop, removeAttribute: noop, addEventListener: noop, removeEventListener: noop, appendChild: noop, removeChild: noop, dispatchEvent: noop, classList: { add: noop, remove: noop, contains: function() { return false; }, toggle: noop } };

  global.document = {
    createElement:           function () { return Object.assign({}, nullEl); },
    createElementNS:         function () { return Object.assign({}, nullEl); },
    createTextNode:          function () { return { nodeValue: '' }; },
    createComment:           function () { return {}; },
    createDocumentFragment:  function () { return { appendChild: noop, childNodes: [] }; },
    getElementById:          function () { return null; },
    getElementsByTagName:    function () { return []; },
    getElementsByClassName:  function () { return []; },
    querySelector:           function () { return null; },
    querySelectorAll:        function () { return { forEach: noop, length: 0 }; },
    body: Object.assign({}, nullEl, { style: { setProperty: noop, removeProperty: noop } }),
    head: Object.assign({}, nullEl),
    documentElement: Object.assign({}, nullEl, { scrollTop: 0, clientWidth: 0, clientHeight: 0 }),
    defaultView: typeof global !== 'undefined' ? global : {},
    cookie: '',
    title: '',
    readyState: 'complete',
    location: {
      href: 'http://localhost/',
      protocol: 'http:',
      host: 'localhost',
      hostname: 'localhost',
      port: '',
      pathname: '/',
      search: '',
      hash: '',
    },
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: function () { return true; },
    createEvent: function () { return { initEvent: noop, initCustomEvent: noop }; },
    implementation: { createHTMLDocument: function() { return global.document; } },
  };
}

// ─── window ──────────────────────────────────────────────────────────────────
// React Native exposes 'global' but not 'window'; some libs use window.X
if (typeof window === 'undefined') {
  global.window = global;
}

// ─── localStorage / sessionStorage ───────────────────────────────────────────
// Some libs read these at module scope; stub them so they don't throw.
if (typeof localStorage === 'undefined') {
  var _store = {};
  global.localStorage = {
    getItem:    function (k) { return _store[k] !== undefined ? _store[k] : null; },
    setItem:    function (k, v) { _store[k] = String(v); },
    removeItem: function (k) { delete _store[k]; },
    clear:      function ()  { _store = {}; },
    key:        function ()  { return null; },
    length: 0,
  };
}
if (typeof sessionStorage === 'undefined') {
  global.sessionStorage = global.localStorage;
}
