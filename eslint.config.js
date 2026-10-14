const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
        ...globals.jest,
        ...globals.browser,
        ...globals.jquery
      }
    },
    rules: {
      // Formatting rules delegated to Prettier — only enforce logic/correctness here
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off'
    }
  },
  {
    files: ['src/**/*.js'],
    ignores: ['src/config/config.js'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration from src/config/config.js, not process.env.'
        }
      ]
    }
  },
  {
    ignores: ['node_modules/', 'dist/', 'logs/', '*.log', 'coverage/', 'package-lock.json']
  }
];
