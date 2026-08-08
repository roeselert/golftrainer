import js from '@eslint/js';
import globals from 'globals';
import security from 'eslint-plugin-security';
import prettier from 'eslint-config-prettier';

/**
 * The interesting part of this file is the "offline core" block near the
 * bottom. Everything above it is ordinary linting; that block is where the
 * architecture rule from CLAUDE.md §1.4 stops being prose and starts being
 * enforced.
 */

/** Network APIs the offline core must never reach for. */
const networkGlobals = [
  {
    name: 'fetch',
    message:
      'The offline core must work with no network (QG1). If this really needs remote data, it belongs in src/online/.',
  },
  {
    name: 'XMLHttpRequest',
    message: 'The offline core must work with no network (QG1). Move this to src/online/.',
  },
  {
    name: 'WebSocket',
    message: 'The offline core must work with no network (QG1). Move this to src/online/.',
  },
  {
    name: 'EventSource',
    message: 'The offline core must work with no network (QG1). Move this to src/online/.',
  },
];

export default [
  {
    ignores: [
      'vendor/**',
      'node_modules/**',
      'coverage/**',
      'report/**',
      'test-results/**',
      // Playwright's HTML report bundles its own minified JavaScript. Without
      // this, running the tests and then `npm run signals` locally lints the
      // report instead of the app.
      'playwright-report/**',
      '.claude/**',
      // Assembled deployment: copies of files already linted at their source.
      '_site/**',
    ],
  },

  js.configs.recommended,
  security.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // Browser code.
  {
    files: ['src/**/*.js', 'sw.js'],
    languageOptions: { globals: globals.browser },
  },

  // Service worker.
  {
    files: ['sw.js'],
    languageOptions: { globals: { ...globals.serviceworker, ...globals.browser } },
  },

  // Node-side tooling and tests.
  {
    files: [
      'tools/**/*.mjs',
      'test/**/*.js',
      'e2e/**/*.js',
      'eslint.config.mjs',
      'playwright.config.js',
      'playwright.pages.config.js',
    ],
    // Specs are Node code that also contains browser code, inside
    // `page.evaluate` callbacks that run in the page rather than the runner.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'no-console': 'off',
      // Tooling legitimately builds paths from resolved module locations.
      'security/detect-non-literal-fs-filename': 'off',
    },
  },

  // ---------------------------------------------------------------------
  // The dependency rule (CLAUDE.md §1.4), enforced.
  //
  //   Online capabilities may depend on offline capabilities.
  //   Never the reverse.
  //
  // A violation here is not a style problem. It means the app can no longer
  // be trusted to work on the course, which is quality goal 1.
  // ---------------------------------------------------------------------
  {
    files: ['src/offline/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/online/**', '**/online'],
              message:
                'Dependency rule violation (CLAUDE.md §1.4): the offline core must not depend on an online capability. Dependencies point one way only — online may import offline, never the reverse.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...networkGlobals],
    },
  },

  // ---------------------------------------------------------------------
  // The app shell (CLAUDE.md TD13).
  //
  // Navigation belongs to neither half: the router reaches Round Capture
  // (offline) and Round Simulation (online) alike. It is precached and it runs
  // on the course, so it carries the offline constraints even though it is not
  // part of the offline core:
  //
  //   - no network calls, same as the offline core
  //   - no *static* import of an online capability, which would drag it into
  //     the cold-start path
  //
  // A dynamic import() at the moment the golfer taps an online destination is
  // the intended escape hatch, and is deliberately not restricted here.
  // ---------------------------------------------------------------------
  {
    files: ['src/shell/**/*.js', 'src/main.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/online/**', '**/online'],
              message:
                'The shell must boot with no network, so an online capability cannot be imported statically. Load it with a dynamic import() when the golfer navigates to it.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...networkGlobals],
    },
  },

  prettier,
];
