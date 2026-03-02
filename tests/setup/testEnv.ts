/**
 * Test Environment Setup (runs via setupFilesAfterSetup — after test framework is ready)
 *
 * Lifecycle hooks that require beforeEach, beforeAll, afterAll, etc.
 */

// --- Console Noise Reduction ---
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
    console.warn = (...args: unknown[]) => {
        const message = typeof args[0] === 'string' ? args[0] : '';
        if (
            message.includes('Animated') ||
            message.includes('NativeModule') ||
            message.includes('useNativeDriver')
        ) {
            return;
        }
        originalWarn.apply(console, args);
    };

    console.error = (...args: unknown[]) => {
        const message = typeof args[0] === 'string' ? args[0] : '';
        if (
            message.includes('Warning: An update to') ||
            message.includes('act()')
        ) {
            return;
        }
        originalError.apply(console, args);
    };
});

afterAll(() => {
    console.warn = originalWarn;
    console.error = originalError;
});
