import { Platform } from 'react-native';

export const typography = {
    fonts: {
        sans: Platform.select({ ios: 'System', android: 'Roboto', default: 'System' }),
        mono: Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' }),
    },
    sizes: {
        xs: 12,
        sm: 14,
        md: 16,
        lg: 18,
        xl: 20,
        '2xl': 24,
        '3xl': 30,
        '4xl': 36,
    },
    weights: {
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
    } as const,
};
