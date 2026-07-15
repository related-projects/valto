/**
 * Theme Hook (backwards-compatible re-export)
 *
 * All components use `useTheme()` from this file.
 * Internally delegates to the ThemeContext provider.
 */

export { useThemeContext as useTheme } from './ThemeContext';
