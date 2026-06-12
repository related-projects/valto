// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  // Clean Architecture boundary: the domain layer must never import from the
  // data layer (dependency rule). Use cases depend only on domain repository
  // interfaces; concrete repositories live in src/data and implement them.
  // This makes the violation impossible to reintroduce — the lint fails.
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/data/**', '@/src/data/**', '../**/data/**', '../../data/**'],
              message:
                'Domain must not import from the data layer (Clean Architecture dependency rule). Depend on a domain repository interface in src/domain/repositories instead.',
            },
          ],
        },
      ],
    },
  },
]);
