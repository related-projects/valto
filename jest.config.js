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
};
