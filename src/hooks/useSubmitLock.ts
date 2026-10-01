/**
 * useSubmitLock Hook
 *
 * Wraps a submit handler so that a press made while an earlier one is still
 * running does nothing (REGISTRE V-112, V-120, V-121, V-122; Owner decision of
 * 01/10, pass 67).
 *
 * A submit control's `disabled` prop comes from state, and state reaches the
 * touchable only once React has committed: a second press delivered in the
 * same event batch as the first still finds the control enabled and calls the
 * handler again. The lock is a ref, checked and set before anything else runs,
 * so that second call returns at once. It is released when the submit settles,
 * whichever way it ends: success, a refused input, a refusal from a use case,
 * or a thrown error. Verified by AddTransactionModal.submitLock.test.tsx,
 * TransferModal.submitLock.test.tsx, AddWalletModal.submitLock.test.tsx and
 * RecurringRulesScreen.submitLock.test.tsx.
 */

import { useRef } from 'react';

export function useSubmitLock(submit: () => Promise<void>): () => Promise<void> {
    const running = useRef(false);

    return async () => {
        if (running.current) {
            return;
        }
        running.current = true;
        try {
            await submit();
        } finally {
            running.current = false;
        }
    };
}
