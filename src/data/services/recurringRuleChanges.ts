/**
 * Recurring rule changes: edit and pause (REGISTRE V-105)
 *
 * An edit or a pause acts at a point in time and never rewrites what was due
 * before it. Owner decisions of 01/10:
 *
 *  1. An edit of an active rule first records every occurrence due under the
 *     stored rule, with the old values; then the edit is saved and applies
 *     going forward (RecurringTransactionRepository.updateFromDTO).
 *  2. A funds refusal of that catch-up refuses the edit, with the reason named.
 *  4. A paused rule stays editable; nothing is due while paused, so there is
 *     nothing to catch up.
 *  5. A pause first records what is due; when that is refused, the rule is
 *     paused anyway and the unrecorded occurrences are returned to be named.
 *     The Owner extended this to any other failure of the pre-pause catch-up.
 *  8. A rule whose wallet or category is missing cannot record what is due.
 *     An edit that keeps the schedule is saved without a catch-up and leaves
 *     those occurrences due, to be generated with the saved values once the
 *     reference is repaired; an edit that changes the frequency or the
 *     interval is refused, naming the missing reference. Extended by V-118
 *     (Owner decision 3 of 01/10, pass 71): an edit that places the end
 *     before such an occurrence, or reopens an ended rule while one is due,
 *     is refused too, naming the reference and the dates.
 *
 * The catch-up is the engine's own per-occurrence path (retryRule): each
 * occurrence is its own database transaction. The save runs after it, in a
 * transaction of its own (REGISTRE V-109), never inside one of the catch-up's,
 * so no runner call is ever nested (REGISTRE V-106). The rule is read again in
 * that transaction, inside updateFromDTO and pauseRule, so the save cannot
 * write a stale lastGeneratedIndex, lastGeneratedDate or scheduleVersion, and
 * a save made while another transaction is open - a restore - waits for it to
 * end instead of being erased by its rollback. Verified by
 * writesThroughRunner.test.ts - "V-109 c12" and "V-109 c2".
 *
 * Resume needs no catch-up and lives on the repository: resumeRule.
 *
 * Verified by recurringEditPauseForward.test.ts.
 *
 * Every catch-up here, and the run after a create, is recorded in the list of
 * rules whose last run failed (REGISTRE V-111, Owner decision 3, pass 79; see
 * core/recurring/failedRuleRuns).
 */

import { recordEngineRun, recordRuleRun } from '../../core/recurring/failedRuleRuns';
import {
    computeDueOccurrences,
    deriveLastGeneratedIndex,
    endOccurrenceIndexForEdit,
    endOccurrenceIndexOf,
    lastOccurrenceIndexBefore,
    startOfDay,
    type DueOccurrence,
} from '../../domain/calculations/recurrenceDates';
import type { RecurringTransaction, UpdateRecurringTransactionDTO } from '../../domain/entities/RecurringTransaction';
import {
    RecurringCatchUpRefusedError,
    RecurringEndDateEditRefusedError,
    RecurringRuleReferenceMissingError,
    type RecurringRuleReference,
} from '../../domain/useCases/errors';
import { RepositoryError, RepositoryErrorType } from '../repositories/IRepository';
import { processRecurringRules, retryRule, type RecurringEngineDeps } from './RecurringTransactionEngine';

/** What a pause did: the paused rule, and the occurrences it could not record first. */
export interface PauseOutcome {
    rule: RecurringTransaction;
    /** Local days of the occurrences that were due and are not in the ledger. */
    unrecorded: Date[];
}

/**
 * What the engine run after a create did for the new rule (REGISTRE V-111,
 * Owner decision 1, pass 79). The run covers every active rule; this is the
 * new rule's part of it only.
 */
export interface CreatedRuleOutcome {
    /** Its occurrences that were due and are now in the ledger. */
    recorded: number;
    /** Local days of its occurrences that were due and are not in the ledger. */
    unrecorded: Date[];
    /** Whether the funds guard refused its catch-up. */
    skipped: boolean;
}

/**
 * Thrown when the catch-up before an edit failed for a reason other than
 * funds (REGISTRE V-111, Owner decision 2, pass 79): nothing was saved, and
 * `unrecordedDates` are the local days of the occurrences that were due and
 * are still not in the ledger - those the catch-up wrote before it failed are
 * not among them. Defined here rather than with the domain refusals: it is
 * thrown by this service only.
 */
export class RecurringCatchUpFailedError extends Error {
    constructor(public readonly unrecordedDates: Date[]) {
        super(`The catch-up before the edit left ${unrecordedDates.length} occurrence(s) unrecorded`);
        this.name = 'RecurringCatchUpFailedError';
    }
}

/** The occurrences of `due` that `stored` has not recorded yet. */
function notRecorded(due: DueOccurrence[], stored: RecurringTransaction): DueOccurrence[] {
    const done = stored.lastGeneratedIndex ?? deriveLastGeneratedIndex(stored);
    return due.filter((occurrence) => occurrence.index > done);
}

async function getRule(deps: RecurringEngineDeps, id: string): Promise<RecurringTransaction> {
    const rule = await deps.recurringRepo.getById(id);
    if (!rule) {
        throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${id} not found`);
    }
    return rule;
}

/** The references of `rule` that no longer exist. */
async function missingReferences(
    deps: RecurringEngineDeps,
    rule: RecurringTransaction,
): Promise<RecurringRuleReference[]> {
    const missing: RecurringRuleReference[] = [];
    if (!(await deps.walletRepo.getById(rule.walletId))) missing.push('wallet');
    if (!(await deps.categoryRepo.getById(rule.categoryId))) missing.push('category');
    return missing;
}

/**
 * The occurrences due under the stored rule that block an edit saved without a
 * catch-up - the edit of a rule whose wallet or category is missing (V-105
 * decision 8) - or an empty list when nothing does:
 *
 *  - those after the end the edit sets: once the end is before them they
 *    would never be generated (REGISTRE V-118, Owner decision 3);
 *  - all of them when the edit reopens an ended rule: skipping the time it
 *    was ended (decision 4) would skip them too (Owner answer of 01/10).
 *
 * The rule's schedule is unchanged here: a schedule change is refused first.
 * Verified by recurringEndOccurrenceIndex.test.ts - "V-118 a.", "V-118 b." and
 * "V-118 c.".
 */
function dueOccurrencesBlockingTheEdit(
    rule: RecurringTransaction,
    dto: UpdateRecurringTransactionDTO,
    now: Date,
): DueOccurrence[] {
    const due = computeDueOccurrences(rule, startOfDay(now));
    if (due.length === 0) return [];

    const endDate = dto.endDate !== undefined ? (dto.endDate ?? undefined) : rule.endDate;
    const edited: RecurringTransaction = { ...rule, endDate };
    const newEnd = endOccurrenceIndexOf({ ...edited, endOccurrenceIndex: endOccurrenceIndexForEdit(rule, edited) });

    if (newEnd !== null && due.some((occurrence) => occurrence.index > newEnd)) {
        return due.filter((occurrence) => occurrence.index > newEnd);
    }

    const oldEnd = endOccurrenceIndexOf(rule);
    const reopens = oldEnd !== null && (newEnd === null || newEnd > oldEnd);
    if (reopens && lastOccurrenceIndexBefore(edited, now) > oldEnd) {
        return due;
    }
    return [];
}

/** The save of an edit: the rule is read again and written in one transaction. */
function saveEdit(
    deps: RecurringEngineDeps,
    dto: UpdateRecurringTransactionDTO,
    now: Date,
): Promise<RecurringTransaction> {
    return deps.runInTransaction(() => deps.recurringRepo.updateFromDTO(dto, now));
}

/**
 * Edit a rule going forward. `now` is the moment of the edit: the catch-up
 * runs up to its local day and the new state starts after it.
 *
 * Throws RecurringCatchUpRefusedError when the funds guard refuses the
 * catch-up, RecurringRuleReferenceMissingError when the edit changes the
 * schedule of a rule whose wallet or category is missing, and
 * RecurringEndDateEditRefusedError when such an edit would leave a due
 * occurrence out of the ledger for good (dueOccurrencesBlockingTheEdit); in
 * every case nothing is generated and nothing is saved. Throws
 * RecurringCatchUpFailedError when the catch-up failed otherwise: nothing is
 * saved, and what it wrote before failing stays in the ledger (REGISTRE V-111,
 * Owner decision 2, pass 79; verified by
 * RecurringRulesScreen.v111Outcome.test.tsx - "V-111 c."). Verified by
 * recurringEditPauseForward.test.ts - "b1.", "c.", "d.", "f." and "o.", and
 * "control: decision 8, an edit that keeps the schedule...", and
 * recurringEndOccurrenceIndex.test.ts - "V-118 a.", "V-118 b." and "V-118 c.".
 */
export async function editRecurringRule(
    deps: RecurringEngineDeps,
    dto: UpdateRecurringTransactionDTO,
    now: Date = new Date(),
): Promise<RecurringTransaction> {
    const rule = await getRule(deps, dto.id);

    if (rule.isPaused) {
        return saveEdit(deps, dto, now);
    }

    const missing = await missingReferences(deps, rule);
    if (missing.length > 0) {
        const reschedules =
            (dto.frequency ?? rule.frequency) !== rule.frequency ||
            (dto.interval ?? rule.interval) !== rule.interval;
        if (reschedules) {
            throw new RecurringRuleReferenceMissingError(missing);
        }
        const blocking = dueOccurrencesBlockingTheEdit(rule, dto, now);
        if (blocking.length > 0) {
            throw new RecurringEndDateEditRefusedError(missing, blocking.map((occurrence) => occurrence.date));
        }
        return saveEdit(deps, dto, now);
    }

    const due = computeDueOccurrences(rule, startOfDay(now));
    if (due.length > 0) {
        let result: Awaited<ReturnType<typeof retryRule>>;
        try {
            result = await retryRule(deps, rule.id, now);
        } catch (error) {
            // Named with the dates still unrecorded, as a pause names them
            // (REGISTRE V-111, Owner decision 2, pass 79), instead of reaching
            // the form's generic save failure. Those the catch-up wrote before
            // it failed stay in the ledger and are not listed. A rule deleted,
            // paused or rescheduled meanwhile has no such list to give: the
            // original failure goes on.
            recordRuleRun(rule.id, 'failed');
            const stored = await deps.recurringRepo.getById(rule.id);
            if (
                stored === null ||
                stored.isPaused ||
                (stored.scheduleVersion ?? 0) !== (rule.scheduleVersion ?? 0)
            ) {
                throw error;
            }
            throw new RecurringCatchUpFailedError(notRecorded(due, stored).map((occurrence) => occurrence.date));
        }
        recordRuleRun(rule.id, 'completed');
        if (result.skipped) {
            throw new RecurringCatchUpRefusedError(
                due.map((occurrence) => occurrence.date),
                result.skipped.amount,
                result.skipped.availableBalance,
            );
        }
    }

    return saveEdit(deps, dto, now);
}

/**
 * Pause a rule after recording what is due up to the local day of `now`.
 *
 * The pause always applies. Whatever could not be recorded first - a funds
 * refusal, a missing wallet or category, a failure inside the catch-up - is
 * returned in `unrecorded`, computed from the rule as it stands after the
 * attempt, so an occurrence the catch-up did write is never listed. Verified
 * by recurringEditPauseForward.test.ts - "i.", "j." and "q.".
 */
export async function pauseRecurringRule(
    deps: RecurringEngineDeps,
    id: string,
    now: Date = new Date(),
): Promise<PauseOutcome> {
    const rule = await getRule(deps, id);
    if (rule.isPaused) {
        return { rule, unrecorded: [] };
    }

    const due = computeDueOccurrences(rule, startOfDay(now));
    if (due.length > 0 && (await missingReferences(deps, rule)).length === 0) {
        try {
            await retryRule(deps, id, now);
            recordRuleRun(id, 'completed');
        } catch (error) {
            recordRuleRun(id, 'failed');
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[RecurringRuleChanges] Catch-up before pausing rule ${id} failed: ${message}`);
        }
    }

    // After the catch-up, the rule is read again and paused in one transaction.
    return deps.runInTransaction(async () => {
        const fresh = await getRule(deps, id);
        const unrecorded = notRecorded(due, fresh).map((occurrence) => occurrence.date);

        return { rule: await deps.recurringRepo.pauseRule(id), unrecorded };
    });
}

/**
 * Run the engine after a create and say what it did for the new rule
 * (REGISTRE V-111, Owner decision 1, pass 79).
 *
 * The run still covers every active rule, as it did from the rules screen;
 * only what is returned is narrowed to `rule`. Its due occurrences are
 * computed before the run, from the rule as created, and compared after it
 * with the stored rule - as pauseRecurringRule computes what it left
 * unrecorded - so an error the engine reported for it, or a run that could
 * not read the rules at all, both show up as unrecorded days. Its debits are
 * counted from its own number, never from the run's total.
 *
 * Returns null when the rule was deleted or paused while the run was going:
 * there is nothing left to report about it.
 */
export async function catchUpCreatedRule(
    deps: RecurringEngineDeps,
    rule: RecurringTransaction,
    now: Date = new Date(),
): Promise<CreatedRuleOutcome | null> {
    const due = computeDueOccurrences(rule, startOfDay(now));
    const result = await processRecurringRules(deps);
    recordEngineRun(result);

    const stored = await deps.recurringRepo.getById(rule.id);
    if (stored === null || stored.isPaused) return null;

    const unrecorded = notRecorded(due, stored);
    const skipped = result.skipped.some((skip) => skip.ruleId === rule.id);
    if (unrecorded.length > 0 && !skipped) {
        recordRuleRun(rule.id, 'failed');
    }
    return {
        recorded: due.length - unrecorded.length,
        unrecorded: unrecorded.map((occurrence) => occurrence.date),
        skipped,
    };
}
