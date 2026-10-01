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
 */

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
import { retryRule, type RecurringEngineDeps } from './RecurringTransactionEngine';

/** What a pause did: the paused rule, and the occurrences it could not record first. */
export interface PauseOutcome {
    rule: RecurringTransaction;
    /** Local days of the occurrences that were due and are not in the ledger. */
    unrecorded: Date[];
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
 * every case nothing is generated and nothing is saved. Verified by
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
        const result = await retryRule(deps, rule.id, now);
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
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[RecurringRuleChanges] Catch-up before pausing rule ${id} failed: ${message}`);
        }
    }

    // After the catch-up, the rule is read again and paused in one transaction.
    return deps.runInTransaction(async () => {
        const fresh = await getRule(deps, id);
        const done = fresh.lastGeneratedIndex ?? deriveLastGeneratedIndex(fresh);
        const unrecorded = due.filter((occurrence) => occurrence.index > done).map((occurrence) => occurrence.date);

        return { rule: await deps.recurringRepo.pauseRule(id), unrecorded };
    });
}
