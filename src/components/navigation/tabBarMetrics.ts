/**
 * Tab bar metrics
 *
 * The sizes CustomTabBar draws with, shared so a screen drawn under the tab
 * bar can leave room for it. The tab bar and its floating "+" button are
 * absolutely positioned over the bottom of every tab screen; the "+" sits
 * right above the tab bar, at the right edge.
 *
 * Offsets are distances from the bottom of the screen, in dp, for a given
 * bottom safe-area inset (the navigation bar, since edge-to-edge is on).
 */

import { spacing } from '../../theme/spacing';

/** Height of the tab row, above the bottom inset. */
export const TAB_BAR_HEIGHT = 60;

/** Diameter of the floating "+" button. */
export const FAB_SIZE = 52;

/** Distance from the screen bottom to the bottom edge of the "+" button. */
export function fabBottomOffset(bottomInset: number): number {
    return TAB_BAR_HEIGHT + bottomInset + spacing.sm;
}

/**
 * Distance from the screen bottom to the top edge of the "+" button. A list
 * that ends with at least this much room below its last row keeps that row
 * clear of the button once scrolled to its end (REGISTRE C47).
 */
export function fabTopOffset(bottomInset: number): number {
    return fabBottomOffset(bottomInset) + FAB_SIZE;
}
