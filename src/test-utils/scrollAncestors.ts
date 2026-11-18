/**
 * keyboardShouldPersistTaps of every scroll view above a rendered node,
 * nearest first.
 *
 * React Native offers a new touch to every ScrollView above its target,
 * outermost first, before the target itself
 * (ScrollView.js _handleStartShouldSetResponderCapture). A ScrollView whose
 * value is unset or "never" takes that touch while the soft keyboard is up and
 * only closes the keyboard: the row or button under the finger never sees it.
 * So a control acts on the first tap with the keyboard up only if EVERY scroll
 * view above it says "handled" (or "always"). The walk follows the React tree,
 * as the responder system does, so a scroll view that merely encloses a
 * <Modal> counts as an ancestor of the modal's content.
 *
 * The jest preset replaces ScrollView with a mock that renders a host
 * RCTScrollView carrying all of its props (react-native/jest/mocks/ScrollView.js),
 * and FlatList renders through ScrollView, so the walk collects that host type.
 */

/** The part of a rendered test node this walk reads. */
export interface TreeNode {
    type: unknown;
    props: Record<string, unknown>;
    parent: TreeNode | null;
}

export function scrollAncestorTapModes(node: TreeNode): unknown[] {
    const modes: unknown[] = [];
    for (let current = node.parent; current; current = current.parent) {
        if (current.type === 'RCTScrollView') {
            modes.push(current.props.keyboardShouldPersistTaps);
        }
    }
    return modes;
}
