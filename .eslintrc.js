module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    // Don't require tsconfig for linting (faster and more flexible)
    // project: ['./tsconfig.json', './contracts/tsconfig.json', './client/tsconfig.json'],
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  env: {
    node: true,
    es6: true,
    mocha: true,
  },
  rules: {
    // Prettier integration
    'prettier/prettier': 'error',

    // TypeScript-specific rules
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-non-null-assertion': 'warn',

    // General rules
    'no-console': 'off', // Allow console.log for examples
    'no-constant-condition': ['error', { checkLoops: false }],

    // Import rules
    'no-duplicate-imports': 'error',

    // Best practices
    'prefer-const': 'error',
    'no-var': 'error',
  },
  overrides: [
    {
      // Solidity test files
      files: ['contracts/test/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    {
      // Example files
      files: ['client/examples/**/*.ts'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'typechain/',
    'cache/',
    'artifacts/',
    'coverage/',
    '*.sol', // Solidity has its own linter (solhint)
    '*.circom',
  ],
};
