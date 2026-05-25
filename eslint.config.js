// Flat ESLint config (ESLint 9+).
// We keep the rule set tight: no implicit globals (catches accidental leakage
// between lib.js and content.js), no unused vars, no `var`, no console.error
// in production paths (console.warn is fine for the degradation reporting).

const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', '.dev/**', 'docs/**', '*.zip', 'test-results/**', 'playwright-report/**'],
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        chrome: 'readonly',
      },
    },
    rules: {
      'no-implicit-globals': 'error',
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'no-undef': 'error',
    },
  },
  {
    files: ['background.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        chrome: 'readonly',
      },
    },
  },
  {
    files: ['lib.js', 'storage.js'],
    languageOptions: {
      globals: {
        module: 'writable',
        chrome: 'readonly',
      },
    },
    rules: {
      // lib.js and storage.js are loaded as content scripts ahead of content.js
      // and are expected to expose their top-level functions to the same
      // isolated world. Globals here are intentional.
      'no-implicit-globals': 'off',
    },
  },
  {
    files: ['content.js', 'options/**/*.js'],
    languageOptions: {
      globals: {
        // Provided by lib.js loaded earlier in the same isolated world.
        STATES: 'readonly',
        STATE_NAMES: 'readonly',
        STATE_CODES: 'readonly',
        DEFAULT_NEARBY: 'readonly',
        VALID_TIERS: 'readonly',
        FREE_SHIP_THRESHOLD: 'readonly',
        parsePrice: 'readonly',
        parseShippingCost: 'readonly',
        TCG_CONDITIONS: 'readonly',
        parseConditionAndVariant: 'readonly',
        getUrlConditions: 'readonly',
        listingMatchesHeadlineCondition: 'readonly',
        extractSellerKey: 'readonly',
        classifyState: 'readonly',
        stateCodeFromInfo: 'readonly',
        formatLocation: 'readonly',
        chipColorForPct: 'readonly',
        chipForShipping: 'readonly',
        formatAbsDiff: 'readonly',
        formatPctDiff: 'readonly',
        tierLabel: 'readonly',
        isOurNode: 'readonly',
        createDegradationTracker: 'readonly',
        // Provided by storage.js loaded between lib.js and content.js.
        STORAGE_KEYS: 'readonly',
        ALL_STORAGE_KEYS: 'readonly',
        loadAllSettings: 'readonly',
        saveSetting: 'readonly',
        removeSetting: 'readonly',
        migrateFromLocalStorageIfNeeded: 'readonly',
      },
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['e2e/**/*.js', 'playwright.config.js', 'tools/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
];
