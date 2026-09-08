module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
    es6: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist/**/*', 'node_modules/**/*'],
  rules: {
    // Basic ESLint rules
    'no-console': 'off',
    'prefer-const': 'warn', // Changed to warning
    'no-var': 'warn', // Changed to warning
    'no-unused-vars': 'off', // Turn off base rule
    'no-useless-escape': 'warn',
    'no-prototype-builtins': 'warn',
    'no-case-declarations': 'warn',
    'no-constant-condition': 'warn',
    'no-undef': 'off',
    
    // TypeScript specific rules
    '@typescript-eslint/no-unused-vars': ['warn', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      ignoreRestSiblings: true
    }],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
  },
};
