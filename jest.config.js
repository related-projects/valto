/** @type {import('jest').Config} */
module.exports = {
    preset: 'jest-expo',
    setupFiles: ['./tests/setup/testSetup.ts'],
    setupFilesAfterEnv: ['./tests/setup/testEnv.ts'],
    moduleNameMapper: {
        // Redirect expo winter runtime to empty mock to prevent lazy polyfill crashes
        '^expo/src/winter$': '<rootDir>/tests/mocks/expoWinter.js',
        '^expo/src/winter/runtime$': '<rootDir>/tests/mocks/expoWinter.js',
        '^expo/src/winter/runtime.native$': '<rootDir>/tests/mocks/expoWinter.js',
        // Path aliases
        '^@/(.*)$': '<rootDir>/$1',
    },
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|uuid|@ungap)',
    ],
    testMatch: [
        '**/__tests__/**/*.test.ts',
        '**/__tests__/**/*.test.tsx',
    ],
    collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/**/index.ts',
    ],
    // Anti-regression ratchet, SCOPED to the business logic only. Floors are set
    // just below the measured coverage of each layer (domain ~98/96/96/98,
    // data ~69/58/79/68 for statements/branches/functions/lines) so a drop in the
    // domain or data layers fails CI, while UI (components/screens) — deliberately
    // not unit-tested — imposes NO threshold and never reddens the build.
    // NOTE: directory-path keys enforce the AGGREGATE average across the layer
    // (a glob key would instead enforce each file individually, which is not the
    // intent — the ratchet is on the layer as a whole, not on every file).
    coverageThreshold: {
        './src/domain/': {
            statements: 96,
            branches: 93,
            functions: 93,
            lines: 96,
        },
        './src/data/': {
            statements: 66,
            branches: 56,
            functions: 77,
            lines: 66,
        },
    },
};
