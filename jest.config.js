/** @type {import('jest').Config} */
module.exports = {
    preset: 'jest-expo',
    setupFiles: ['./tests/setup/testSetup.ts'],
    setupFilesAfterEnv: ['./tests/setup/testEnv.ts'],
    // One global allowance, raised from the 5000ms default. This does NOT cover
    // the expensive part of a component suite: the transform-and-require cost of
    // the React Native module graph is paid while the test file is being loaded,
    // before any hook is entered, and jest does not time that at all. What it
    // covers is the first test in a component file, which pays a cold render on
    // top of its own assertions: measured at 1.6-2.3s when that suite runs alone,
    // but 6.2-8.9s in a cold full run, where 7 workers realise the module graph
    // at the same time. The headroom over that worst case is under 2x, and the CI
    // runner is slower than the machine it was measured on. It is deliberately a
    // single value: a per-file timeout argument is a private allowance nobody
    // else can see, and tests/__tests__/noPerFileTimeouts.test.ts fails if one
    // is introduced.
    testTimeout: 15000,
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
    // domain or data layers fails CI, while UI (components/screens) - deliberately
    // not unit-tested - imposes NO threshold and never reddens the build.
    // NOTE: directory-path keys enforce the AGGREGATE average across the layer
    // (a glob key would instead enforce each file individually, which is not the
    // intent - the ratchet is on the layer as a whole, not on every file).
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
