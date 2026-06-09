/**
 * Accessibility Utility
 *
 * Typed helper functions that produce React Native accessibility props.
 * All labels should be passed through i18n's t() at the call site.
 */

import type { AccessibilityRole } from 'react-native';

interface ButtonA11yProps {
    accessible: true;
    accessibilityRole: 'button';
    accessibilityLabel: string;
    accessibilityHint?: string;
}

interface InputA11yProps {
    accessible: true;
    accessibilityLabel: string;
    accessibilityHint?: string;
}

interface HeaderA11yProps {
    accessible: true;
    accessibilityRole: 'header';
    accessibilityLabel: string;
}

interface ImageA11yProps {
    accessible: true;
    accessibilityRole: 'image';
    accessibilityLabel: string;
}

interface LinkA11yProps {
    accessible: true;
    accessibilityRole: 'link';
    accessibilityLabel: string;
    accessibilityHint?: string;
}

interface GenericA11yProps {
    accessible: true;
    accessibilityRole?: AccessibilityRole;
    accessibilityLabel: string;
    accessibilityHint?: string;
}

/**
 * Returns accessibility props for a button element.
 * @param label - Translated label describing the button action
 * @param hint - Optional translated hint for extra context
 */
export function getButtonA11y(label: string, hint?: string): ButtonA11yProps {
    return {
        accessible: true,
        accessibilityRole: 'button',
        accessibilityLabel: label,
        ...(hint ? { accessibilityHint: hint } : {}),
    };
}

/**
 * Returns accessibility props for an input element.
 * @param label - Translated label describing the input
 * @param hint - Optional translated hint for extra context
 */
export function getInputA11y(label: string, hint?: string): InputA11yProps {
    return {
        accessible: true,
        accessibilityLabel: label,
        ...(hint ? { accessibilityHint: hint } : {}),
    };
}

/**
 * Returns accessibility props for a heading element.
 * @param label - Translated heading text
 */
export function getHeaderA11y(label: string): HeaderA11yProps {
    return {
        accessible: true,
        accessibilityRole: 'header',
        accessibilityLabel: label,
    };
}

/**
 * Returns accessibility props for an image element.
 * @param label - Translated description of the image
 */
export function getImageA11y(label: string): ImageA11yProps {
    return {
        accessible: true,
        accessibilityRole: 'image',
        accessibilityLabel: label,
    };
}

/**
 * Returns accessibility props for a link element.
 * @param label - Translated label describing the link
 * @param hint - Optional translated hint for extra context
 */
export function getLinkA11y(label: string, hint?: string): LinkA11yProps {
    return {
        accessible: true,
        accessibilityRole: 'link',
        accessibilityLabel: label,
        ...(hint ? { accessibilityHint: hint } : {}),
    };
}

/**
 * Returns generic accessibility props.
 * @param label - Translated label
 * @param role - Optional accessibility role
 * @param hint - Optional translated hint
 */
export function getA11y(label: string, role?: AccessibilityRole, hint?: string): GenericA11yProps {
    return {
        accessible: true,
        accessibilityLabel: label,
        ...(role ? { accessibilityRole: role } : {}),
        ...(hint ? { accessibilityHint: hint } : {}),
    };
}
