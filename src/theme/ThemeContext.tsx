/**
 * Theme Context
 *
 * Provides a global theme preference that can be overridden by the user.
 * Defaults to 'system' which follows the device's color scheme.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { loadSettings, type ThemePreference } from '../data/services/settingsService';
import { palette } from './colors';
import { radius } from './radius';
import { shadows } from './shadows';
import { spacing } from './spacing';
import { typography } from './typography';

// ─── Resolved Theme Type ──────────────────────────────────────────────

interface ThemeValue {
    colors: typeof palette.light;
    typography: typeof typography;
    spacing: typeof spacing;
    radius: typeof radius;
    shadows: typeof shadows;
    isDark: boolean;
    themePreference: ThemePreference;
    setThemePreference: (pref: ThemePreference) => void;
}

const ThemeCtx = createContext<ThemeValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const systemScheme = useColorScheme();
    const [preference, setPreference] = useState<ThemePreference>('system');

    // Load persisted preference on mount
    useEffect(() => {
        loadSettings().then(s => setPreference(s.theme));
    }, []);

    // Resolve effective dark mode
    const isDark = preference === 'system'
        ? systemScheme === 'dark'
        : preference === 'dark';

    const colors = isDark ? palette.dark : palette.light;

    const resolvedShadows = isDark
        ? {
            ...shadows,
            soft: { ...shadows.soft, shadowColor: '#000', shadowOpacity: 0.3 },
            card: { ...shadows.card, shadowColor: '#000', shadowOpacity: 0.4 },
            elevated: { ...shadows.elevated, shadowColor: '#000', shadowOpacity: 0.5 },
        }
        : shadows;

    const value: ThemeValue = {
        colors,
        typography,
        spacing,
        radius,
        shadows: resolvedShadows,
        isDark,
        themePreference: preference,
        setThemePreference: setPreference,
    };

    return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
};

// ─── Hook ─────────────────────────────────────────────────────────────

/**
 * Access the current theme. Must be used within <ThemeProvider>.
 * Falls back to light theme outside the provider (for tests/storybooks).
 */
export function useThemeContext(): ThemeValue {
    const ctx = useContext(ThemeCtx);
    if (ctx) return ctx;

    // Fallback for when no provider is present (tests, etc.)
    return {
        colors: palette.light,
        typography,
        spacing,
        radius,
        shadows,
        isDark: false,
        themePreference: 'system',
        setThemePreference: () => { },
    };
}
