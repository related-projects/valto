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
 *     interval is refused, naming the missing reference.
 *
 * The catch-up is the engine's own per-occurrence path (retryRule): each
 * occurrence is its own database transaction, and nothing here opens one, so
 * no runner call is ever nested (REGISTRE V-106). The rule is read again after
 * the catch-up, inside updateFromDTO and pauseRule, so the save cannot write a
 * stale lastGeneratedIndex, lastGeneratedDate or scheduleVersion.
 *
 * Resume needs no catch-up and lives on the repository: resumeRule.
 *
 * Verified by recurringEditPauseForward.test.ts.
 */

import { computeDueOccurrences, deriveLastGeneratedIndex, startOfDay } from '../../domain/calculations/recurrenceDates';
import type { RecurringTransaction, UpdateRecurringTransactionDTO } from '../../domain/entities/RecurringTransaction';
import {
    RecurringCatchUpRefusedError,
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
 * Edit a rule going forward. `now` is the moment of the edit: the catch-up
 * runs up to its local day and the new state starts after it.
 *
 * Throws RecurringCatchUpRefusedError when the funds guard refuses the
 * catch-up, and RecurringRuleReferenceMissingError when the edit changes the
 * schedule of a rule whose wallet or category is missing; in both cases
 * nothing is generated and nothing is saved. Verified by
 * recurringEditPauseForward.test.ts - "b1.", "c.", "d.", "f." and "o.", and
 * "control: decision 8, an edit that keeps the schedule...".
 */
export async function editRecurringRule(
    deps: RecurringEngineDeps,
    dto: UpdateRecurringTransactionDTO,
    now: Date = new Date(),
): Promise<RecurringTransaction> {
    const rule = await getRule(deps, dto.id);

    if (rule.isPaused) {
        return deps.recurringRepo.updateFromDTO(dto, now);
    }

    const missing = await missingReferences(deps, rule);
    if (missing.length > 0) {
        const reschedules =
            (dto.frequency ?? rule.frequency) !== rule.frequency ||
            (dto.interval ?? rule.interval) !== rule.interval;
        if (reschedules) {
            throw new RecurringRuleReferenceMissingError(missing);
        }
        return deps.recurringRepo.updateFromDTO(dto, now);
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

    return deps.recurringRepo.updateFromDTO(dto, now);
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

    const fresh = await getRule(deps, id);
    const done = fresh.lastGeneratedIndex ?? deriveLastGeneratedIndex(fresh);
    const unrecorded = due.filter((occurrence) => occurrence.index > done).map((occurrence) => occurrence.date);

    return { rule: await deps.recurringRepo.pauseRule(id), unrecorded };
}
