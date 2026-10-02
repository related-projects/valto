/**
 * Restoring State (REGISTRE V-119, V-106; Owner decision 1, pass 74)
 *
 * Whether a restore is running, from the moment the user confirms it until the
 * restore call settles, post-restore catch-up included. While it is, the app
 * shows one blocking wait screen above everything (RestoreWaitScreen) and no
 * other action can be started.
 *
 * Deliberately NOT the settings screen's `loading` flag, and not component
 * state at all:
 *  - `loading` is shared by every settings action, so any of them finishing
 *    cleared it while the restore was still running;
 *  - the settings screen does not outlive the restore: the file picker sends
 *    the app to the background, the app locks itself, and SecurityGate unmounts
 *    the whole navigator while the restore keeps running in its closure.
 * A module-level value survives both, and the wait screen reads it from above
 * SecurityProvider. Verified by restoreWaitScreen.test.tsx - "V-119/V-106 b"
 * and "V-119/V-106 c".
 *
 * A count rather than a flag: each beginRestoring() is matched by its own end,
 * so one restore settling can never clear the screen for another.
 */

import { useSyncExternalStore } from 'react';

let running = 0;
const listeners = new Set<() => void>();

function notify(): void {
    for (const listener of listeners) {
        listener();
    }
}

/**
 * Mark a restore as running. Returns the function that marks it ended; calling
 * that function more than once ends it once.
 */
export function beginRestoring(): () => void {
    running++;
    notify();

    let ended = false;
    return () => {
        if (ended) return;
        ended = true;
        running--;
        notify();
    };
}

/** True while at least one restore is running. */
export function isRestoring(): boolean {
    return running > 0;
}

/** Call `listener` whenever isRestoring() may have changed. Returns the unsubscribe. */
export function subscribeRestoring(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** isRestoring(), re-rendering the caller whenever it changes. */
export function useRestoring(): boolean {
    return useSyncExternalStore(subscribeRestoring, isRestoring, isRestoring);
}
