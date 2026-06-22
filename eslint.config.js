// Root flat ESLint config (ESLint v9).
//
// Why this exists: every workspace runs a bare `eslint .` (or `eslint src`),
// and ESLint v9 REQUIRES a flat `eslint.config.js` — without one it hard-errors
// ("couldn't find an eslint.config file"), which failed the CI "Lint & Type
// Check" job on the first workspace. ESLint walks up from each workspace's cwd,
// so this single root config serves them all.
//
// Scope is deliberately LIGHT: type safety is enforced by `tsc`
// (check-types / typecheck) and security by CodeQL + gitleaks, so this config's
// job is just to make `eslint .` run cleanly under v9 and catch a few genuine
// foot-guns. Tighten the ruleset in a dedicated lint pass later.
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');
const react = require('eslint-plugin-react');
const nextPlugin = require('@next/eslint-plugin-next');

module.exports = tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.expo/**',
      '**/coverage/**',
      '**/generated/**',
      '**/.turbo/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.cjs',
    ],
  },
  {
    // Pre-existing inline `// eslint-disable ...` directives across the repo
    // become "unused" once we register the plugins with their rules off (below).
    // Don't flag that — these directives are documentation of intent and were
    // valid under the old .eslintrc setup.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Register every plugin whose rules appear in inline `eslint-disable`
    // comments across the repo (@typescript-eslint, react-hooks, react,
    // @next/next). The RULES stay off — registration just makes those names
    // resolvable so a pre-existing directive doesn't itself error under v9
    // ("Definition for rule not found"). Type safety is enforced by tsc and
    // security by CodeQL/gitleaks; tighten this ruleset in a dedicated pass.
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
      react,
      '@next/next': nextPlugin,
    },
    rules: {
      'no-debugger': 'error',
      'no-var': 'error',
    },
  },
);
