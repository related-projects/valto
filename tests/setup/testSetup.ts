/**
 * Test Mocks Setup (runs via setupFiles)
 *
 * Registers jest.mock() calls for native modules used across all test suites.
 * The expo/src/winter runtime is handled by moduleNameMapper in jest.config.js.
 */

// --- AsyncStorage Mock ---
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// --- React Native Reanimated Mock ---
jest.mock('react-native-reanimated', () => {
    const Reanimated = require('react-native-reanimated/mock');
    Reanimated.default.call = () => { };
    return Reanimated;
});

// --- React Native Gesture Handler Mock ---
jest.mock('react-native-gesture-handler', () => ({
    Swipeable: jest.fn(),
    DrawerLayout: jest.fn(),
    State: {},
    ScrollView: jest.fn(),
    Slider: jest.fn(),
    Switch: jest.fn(),
    TextInput: jest.fn(),
    ToolbarAndroid: jest.fn(),
    ViewPagerAndroid: jest.fn(),
    DrawerLayoutAndroid: jest.fn(),
    WebView: jest.fn(),
    NativeViewGestureHandler: jest.fn(),
    TapGestureHandler: jest.fn(),
    FlingGestureHandler: jest.fn(),
    ForceTouchGestureHandler: jest.fn(),
    LongPressGestureHandler: jest.fn(),
    PanGestureHandler: jest.fn(),
    PinchGestureHandler: jest.fn(),
    RotationGestureHandler: jest.fn(),
    GestureHandlerRootView: jest.fn(),
    Directions: {},
}));

// --- UUID Mock (deterministic IDs) ---
let mockUuidCounter = 0;
jest.mock('uuid', () => ({
    v4: () => `test-uuid-${++mockUuidCounter}`,
}));

// --- react-native-get-random-values ---
jest.mock('react-native-get-random-values', () => { });

// --- expo-secure-store (native keystore) ---
// The production DB module statically imports the encryption-key helper, which
// imports expo-secure-store. Tests never open the encrypted DB, but importing
// the module chain would otherwise fail with "Cannot find native module".
jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async () => null),
    setItemAsync: jest.fn(async () => undefined),
    deleteItemAsync: jest.fn(async () => undefined),
    AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
}));
