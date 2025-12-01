import { useColorScheme } from 'react-native';
import { palette } from './colors';
import { radius } from './radius';
import { shadows } from './shadows';
import { spacing } from './spacing';
import { typography } from './typography';

export const useTheme = () => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const colors = isDark ? palette.dark : palette.light;

    return {
        colors,
        typography,
        spacing,
        radius,
        shadows: isDark ? { ...shadows, soft: { ...shadows.soft, shadowColor: '#000', shadowOpacity: 0.3 }, card: { ...shadows.card, shadowColor: '#000', shadowOpacity: 0.4 }, elevated: { ...shadows.elevated, shadowColor: '#000', shadowOpacity: 0.5 } } : shadows,
        isDark,
    };
};

export const theme = {
    light: {
        colors: palette.light,
        typography,
        spacing,
        radius,
        shadows,
    },
    dark: {
        colors: palette.dark,
        typography,
        spacing,
        radius,
        shadows, // Should ideally be adjusted for dark mode as in the hook
    },
};
