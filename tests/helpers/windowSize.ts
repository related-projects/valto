/**
 * Changing the window size inside a test, the way the device does it.
 *
 * Dimensions.set is what React Native's native side calls on a rotation, a fold
 * or a split-screen resize: it replaces the stored metrics and emits 'change',
 * which is what useWindowDimensions subscribes to. A test that mocked the hook
 * instead would prove nothing about code that never calls it - and code that
 * read Dimensions.get once at module load is exactly the case under test.
 */

import { act } from '@testing-library/react-native';
import { Dimensions, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/**
 * The part of a rendered element this helper reads. Declared here because
 * react-test-renderer ships no types in this project.
 */
interface RenderedNode {
    type: unknown;
    props: { style?: unknown };
    parent: RenderedNode | null;
}

/** The metrics in force when the test file loaded (750x1334 under jest). */
const ORIGINAL = {
    window: Dimensions.get('window'),
    screen: Dimensions.get('screen'),
};

/** Resize the window (and screen) to width x height, keeping scale and fontScale. */
export function resizeWindow(width: number, height: number): void {
    const { scale, fontScale } = Dimensions.get('window');
    const metrics = { width, height, scale, fontScale };
    act(() => {
        Dimensions.set({ window: metrics, screen: metrics });
    });
}

/** Put back the metrics the file started with, so no test inherits a resize. */
export function restoreWindow(): void {
    act(() => {
        Dimensions.set({ window: ORIGINAL.window, screen: ORIGINAL.screen });
    });
}

/**
 * The first numeric `key` found in the flattened style of `node` or of its
 * nearest host ancestor. From a label inside a sheet or a card, that is the
 * container sizing it.
 */
export function nearestHostNumber(
    node: RenderedNode | null,
    key: 'width' | 'height',
): number | undefined {
    for (let current = node; current; current = current.parent) {
        if (typeof current.type !== 'string') continue;
        const value = StyleSheet.flatten(current.props.style as StyleProp<ViewStyle>)?.[key];
        if (typeof value === 'number') return value;
    }
    return undefined;
}
