/**
 * Failed Rule Runs (REGISTRE V-111, Owner decision 3, pass 79)
 *
 * The rules whose last engine run failed: an error the engine reported for the
 * rule (a missing reference, the restart limit of V-115, a write that failed),
 * or due debits a run left unrecorded without a funds refusal. The rules
 * screen shows such a rule as a fault until a later run succeeds; before, a
 * failure with its references present and its funds sufficient read Active.
 *
 * Kept in memory only, never persisted, and fed by every engine run: boot
 * (app/_layout), the run after a create and the edit and pause catch-ups
 * (recurringRuleChanges), and the post-restore catch-up (backupService).
 *
 * A module-level value, as restoringState is: the runs happen outside any
 * component, and the screen reads the value when it mounts. The set is
 * replaced on every change, never mutated, so a reader re-renders.
 */

import { useSyncExternalStore } from 'react';

let failed: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function replace(next: ReadonlySet<string>): void {
    failed = next;
    for (const listener of listeners) {
        listener();
    }
}

/**
 * Record a run over every active rule (processRecurringRules). Each rule it
 * evaluated either failed - it is in `errors` - or completed, so the list
 * becomes the failed ones. A run that evaluated nothing - no active rule, or
 * rules that could not be read at all - completed none, and leaves the list
 * as it was.
 */
export function recordEngineRun(result: {
    rulesEvaluated: number;
    errors: readonly { ruleId: string }[];
}): void {
    if (result.rulesEvaluated === 0) return;
    replace(new Set(result.errors.map((error) => error.ruleId)));
}

/** Record the run of one rule: a failure, or a run that completed. */
export function recordRuleRun(ruleId: string, outcome: 'failed' | 'completed'): void {
    if ((outcome === 'failed') === failed.has(ruleId)) return;
    const next = new Set(failed);
    if (outcome === 'failed') {
        next.add(ruleId);
    } else {
        next.delete(ruleId);
    }
    replace(next);
}

/** The ids of the rules whose last run failed. */
export function getFailedRuleRuns(): ReadonlySet<string> {
    return failed;
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** getFailedRuleRuns(), re-rendering the caller whenever it changes. */
export function useFailedRuleRuns(): ReadonlySet<string> {
    return useSyncExternalStore(subscribe, getFailedRuleRuns, getFailedRuleRuns);
}
