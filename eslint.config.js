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
      'indent': ['error', 2],
      'linebreak-style': ['error', 'unix'],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
      'no-console': 'off',
      'comma-dangle': ['error', 'never'],
      'arrow-parens': ['error', 'always'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
      'space-before-function-paren': [
        'error',
        {
          'anonymous': 'never',
          'named': 'never',
          'asyncArrow': 'always'
        }
      ]
    }
  },
  {
    ignores: [
      'node_modules/',
      'dist/',
      'logs/',
      '*.log',
      'coverage/',
      'package-lock.json'
    ]
  }
];
