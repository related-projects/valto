/**
 * Presses delivered in one event batch (test-only)
 *
 * On the production runtime a state update made in a touch handler commits in
 * a microtask that runs only after the current task, so a second touch whose
 * start is in the same EventQueue flush as the first touch's end negotiates
 * the responder before `disabled` has reached Pressability (pass 67 audits,
 * REGISTRE V-112). fireEvent.press cannot reproduce that: RNTL wraps every
 * press in act(), which flushes the render before the next press.
 *
 * pressTwiceInOneBatch delivers both presses inside ONE synchronous act()
 * callback, so React renders only after both have been handled. Each press
 * goes through the responder handlers Pressability installs on the host view,
 * in the order the responder system calls them: onStartShouldSetResponder (a
 * press is dropped when it returns false, as for a disabled control on a
 * device), then onResponderGrant, then onResponderRelease, which calls
 * onPress. pressEachInOneBatch does the same with one press on each of
 * several controls, in order.
 */

import { act } from '@testing-library/react-native';

/** The part of an element returned by a query that these helpers read. */
export interface RenderedNode {
    readonly props: { [key: string]: unknown };
    readonly parent: RenderedNode | null;
}

type ResponderHandler = (event?: unknown) => unknown;

const RESPONDER = { measure: () => undefined };

/** A touch event carrying what Pressability and TouchableOpacity read from it. */
function touchEvent(registrationName: 'onResponderGrant' | 'onResponderRelease') {
    return {
        persist: () => undefined,
        dispatchConfig: { registrationName },
        // Pressability keeps currentTarget as the responder and ignores a
        // release without one; it asks it to measure the press region, which
        // a press with no movement never needs, so the stub never answers.
        currentTarget: RESPONDER,
        target: RESPONDER,
        nativeEvent: {
            pageX: 0,
            pageY: 0,
            locationX: 0,
            locationY: 0,
            timestamp: Date.now(),
            touches: [],
            changedTouches: [],
        },
    };
}

/** The nearest instance, from `element` up, that carries Pressability's responder handlers. */
export function findPressable(element: RenderedNode): RenderedNode {
    let node: RenderedNode | null = element;
    while (node !== null && typeof node.props.onResponderRelease !== 'function') {
        node = node.parent;
    }
    if (node === null) {
        throw new Error('findPressable: no ancestor carries onResponderRelease');
    }
    return node;
}

function deliverPress(pressable: RenderedNode): void {
    const handlers = pressable.props as Record<string, ResponderHandler>;
    if (!handlers.onStartShouldSetResponder()) {
        return;
    }
    handlers.onResponderGrant(touchEvent('onResponderGrant'));
    handlers.onResponderRelease(touchEvent('onResponderRelease'));
}

/** Two presses on the control holding `element`, with no render in between. */
export function pressTwiceInOneBatch(element: RenderedNode): void {
    const pressable = findPressable(element);
    act(() => {
        deliverPress(pressable);
        deliverPress(pressable);
    });
}

/** One press on each control holding an element, in order, with no render in between. */
export function pressEachInOneBatch(...elements: RenderedNode[]): void {
    const pressables = elements.map(findPressable);
    act(() => {
        for (const pressable of pressables) {
            deliverPress(pressable);
        }
    });
}

/** One press on the control holding `element`, through the same handlers. */
export function pressOnce(element: RenderedNode): void {
    const pressable = findPressable(element);
    act(() => {
        deliverPress(pressable);
    });
}

/**
 * Let every pending submit run to its end. The in-memory database answers
 * through promises and the hooks refresh through promises, so a few
 * macrotask turns drain them all.
 */
export async function settle(rounds = 5): Promise<void> {
    for (let i = 0; i < rounds; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }
}
