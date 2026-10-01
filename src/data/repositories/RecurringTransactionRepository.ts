/**
 * RecurringTransaction Repository
 *
 * Repository for managing RecurringTransaction rule entities, backed by
 * relational SQLite. Handles CRUD and rule-specific queries.
 *
 * Data Integrity:
 * - Validates all entities before persistence via RecurringTransactionValidator
 */

import { v4 as uuidv4 } from 'uuid';
import {
    CreateRecurringTransactionDTO,
    RecurringTransaction,
    UpdateRecurringTransactionDTO,
} from '../../domain/entities/RecurringTransaction';
import { validateRecurringTransaction } from '../../domain/validators/RecurringTransactionValidator';
import {
    addMonthsClamped,
    deriveEndOccurrenceIndex,
    deriveLastGeneratedIndex,
    endOccurrenceIndexForEdit,
    endOccurrenceIndexOf,
    hasOccurrencesLeft,
    lastOccurrenceIndexBefore,
    lastOccurrenceIndexOnOrBefore,
    lastSettledDay,
    startOfDay,
} from '../../domain/calculations/recurrenceDates';
import { ValidationError } from '../../domain/validators/ValidationError';
import {
    recurringMapper,
    sqlDelete,
    sqlExists,
    sqlGetAll,
    sqlGetById,
    sqlInsert,
    sqlUpdate,
} from '../storage/sql/mappers';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';
import type { IRecurringTransactionRepository } from '../../domain/repositories';
import type { IRepository } from './IRepository';
import { RepositoryError, RepositoryErrorType } from './IRepository';

export class RecurringTransactionRepository
    implements IRepository<RecurringTransaction>, IRecurringTransactionRepository {
    constructor(private db: SqlDatabase) { }

    async getAll(): Promise<RecurringTransaction[]> {
        try {
            return await sqlGetAll(this.db, recurringMapper);
        } catch (error) {
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to get all recurring rules', error as Error);
        }
    }

    async getById(id: string): Promise<RecurringTransaction | null> {
        return sqlGetById(this.db, recurringMapper, id);
    }

    /**
     * The rules the engine may execute now: not paused, with an occurrence
     * left to generate.
     *
     * A rule stays here until it has generated its last occurrence, whatever
     * the day of its end (REGISTRE V-114, Owner decision 1). Comparing the end
     * day with today dropped a rule whose end passed before the next launch
     * with an occurrence still due, and lost that occurrence with no trace;
     * and the end day, read in the current zone, moved with the device
     * (V-103). The end is now the number of the last occurrence, fixed when it
     * was chosen. Verified by recurringEndOccurrenceIndex.test.ts - "V-114 a.",
     * "V-103 a." and "V-103 b.", and recurringEndDateBoundary.test.ts.
     */
    async getActiveRules(): Promise<RecurringTransaction[]> {
        const rules = await this.getAll();
        return rules.filter((r) => !r.isPaused && hasOccurrencesLeft(r));
    }

    /**
     * Every rule drawing on a given wallet, paused and expired ones included.
     *
     * Built on getAll, NOT on getActiveRules: this answers "does anything still
     * point here", which is a different question from "what executes now". A
     * paused rule is still a standing order - see IRecurringTransactionRepository.
     */
    async getByWalletId(walletId: string): Promise<RecurringTransaction[]> {
        const rules = await this.getAll();
        return rules.filter((r) => r.walletId === walletId);
    }

    /** Every rule filing against a given category, paused and expired included. */
    async getByCategoryId(categoryId: string): Promise<RecurringTransaction[]> {
        const rules = await this.getAll();
        return rules.filter((r) => r.categoryId === categoryId);
    }

    /**
     * Every rule whose wallet or category no longer exists.
     *
     * The two queries above ask "what still points HERE" and are what the
     * deletion guards need. This asks the same question of the whole table at
     * once, which is what a restore needs: the deletion guards can only refuse a
     * delete the user is making now, and a restore replaces the wallet and
     * category tables wholesale without going near them.
     *
     * Neither reference has a FOREIGN KEY behind it, so this is the only way to
     * learn a rule has been orphaned. Distinct from the engine's per-rule
     * pre-flight, which sees a rule only once something is due for it: a rule
     * whose next occurrence is months away is just as broken and says nothing.
     *
     * Paused and expired rules are included, for the reason set out on
     * IRecurringTransactionRepository: `is_paused` records when a rule runs, not
     * whether it exists.
     */
    async findWithMissingReferences(): Promise<RecurringTransaction[]> {
        try {
            const { rows } = await this.db.execute(
                `SELECT r.* FROM recurring_rules r
                 WHERE NOT EXISTS (SELECT 1 FROM wallets w    WHERE w.id = r.wallet_id)
                    OR NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = r.category_id)`,
            );
            return rows.map(recurringMapper.fromRow);
        } catch (error) {
            throw new RepositoryError(
                RepositoryErrorType.STORAGE_ERROR,
                'Failed to check recurring rule references',
                error as Error,
            );
        }
    }

    async save(rule: RecurringTransaction): Promise<RecurringTransaction> {
        try {
            try {
                validateRecurringTransaction(rule);
            } catch (error) {
                if (error instanceof ValidationError) {
                    console.error(`[RecurringTransactionRepository] Validation failed: ${error.message}`);
                    throw new RepositoryError(RepositoryErrorType.VALIDATION_ERROR, error.message);
                }
                throw error;
            }

            if (await sqlExists(this.db, recurringMapper, rule.id)) {
                throw new RepositoryError(
                    RepositoryErrorType.DUPLICATE_ERROR,
                    `Recurring rule with id ${rule.id} already exists`,
                );
            }

            await sqlInsert(this.db, recurringMapper, rule);
            return rule;
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[RecurringTransactionRepository] Unexpected save failure:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to save recurring rule', error as Error);
        }
    }

    async update(rule: RecurringTransaction): Promise<RecurringTransaction> {
        try {
            try {
                validateRecurringTransaction(rule);
            } catch (error) {
                if (error instanceof ValidationError) {
                    console.error(`[RecurringTransactionRepository] Validation failed: ${error.message}`);
                    throw new RepositoryError(RepositoryErrorType.VALIDATION_ERROR, error.message);
                }
                throw error;
            }

            const affected = await sqlUpdate(this.db, recurringMapper, rule);
            if (affected === 0) {
                throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${rule.id} not found`);
            }
            return rule;
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[RecurringTransactionRepository] Unexpected update failure:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to update recurring rule', error as Error);
        }
    }

    async delete(id: string): Promise<void> {
        try {
            const affected = await sqlDelete(this.db, recurringMapper, id);
            if (affected === 0) {
                throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${id} not found`);
            }
        } catch (error) {
            if (error instanceof RepositoryError) throw error;
            console.error('[RecurringTransactionRepository] Unexpected delete failure:', error);
            throw new RepositoryError(RepositoryErrorType.STORAGE_ERROR, 'Failed to delete recurring rule', error as Error);
        }
    }

    async create(dto: CreateRecurringTransactionDTO): Promise<RecurringTransaction> {
        const now = new Date();
        const rule: RecurringTransaction = {
            id: uuidv4(),
            type: dto.type,
            amount: dto.amount,
            walletId: dto.walletId,
            categoryId: dto.categoryId,
            description: dto.description,
            startDate: dto.startDate,
            endDate: dto.endDate,
            frequency: dto.frequency,
            interval: dto.interval,
            // Watermark one interval before startDate so the first generation includes startDate.
            lastGeneratedDate: this.computeDateBefore(dto.startDate, dto.frequency, dto.interval),
            // Nothing generated yet: occurrence 0, on startDate, is the first due.
            lastGeneratedIndex: -1,
            scheduleVersion: 0,
            isPaused: false,
            createdAt: now,
        };

        // The last occurrence is fixed now, from the end day in this zone
        // (REGISTRE V-103, Owner decision 2). Verified by
        // recurringEndOccurrenceIndex.test.ts - "V-103 b.".
        return this.save(
            rule.endDate
                ? { ...rule, endOccurrenceIndex: deriveEndOccurrenceIndex({ ...rule, endDate: rule.endDate }) }
                : rule,
        );
    }

    /**
     * Save an edit. `now` is the moment of the edit; its local day is where a
     * new schedule starts from. The app edits through editRecurringRule, which
     * records what is due under the stored rule before calling this.
     */
    async updateFromDTO(dto: UpdateRecurringTransactionDTO, now: Date = new Date()): Promise<RecurringTransaction> {
        const existing = await this.getById(dto.id);
        if (!existing) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${dto.id} not found`);
        }

        const merged: RecurringTransaction = {
            ...existing,
            type: dto.type ?? existing.type,
            amount: dto.amount ?? existing.amount,
            walletId: dto.walletId ?? existing.walletId,
            categoryId: dto.categoryId ?? existing.categoryId,
            description: dto.description !== undefined ? dto.description : existing.description,
            endDate: dto.endDate !== undefined ? (dto.endDate ?? undefined) : existing.endDate,
            frequency: dto.frequency ?? existing.frequency,
            interval: dto.interval ?? existing.interval,
        };
        const updated: RecurringTransaction = {
            ...merged,
            endOccurrenceIndex: endOccurrenceIndexForEdit(existing, merged),
        };

        const rescheduled = this.renumberIfRescheduled(existing, updated, now);
        return this.update(rescheduled === updated ? this.reopenIfExtended(existing, updated, now) : rescheduled);
    }

    /**
     * Reopen an ended rule without catching up the time it was ended
     * (REGISTRE V-114, Owner decision 4): when an edit clears the end or moves
     * it later, the next occurrence is the first on or after the local day of
     * the edit, as for a resume (resumeRule, V-105 decision 3) - the number
     * moves to the last occurrence before that day, and never back.
     *
     * Only once every occurrence up to the old end is in the ledger. The edit
     * records them first (editRecurringRule); a rule whose wallet or category
     * is missing cannot, and an edit that would have to skip past one of them
     * is refused there (Owner answer of 01/10). A rule that is not ended has
     * nothing before the edit day to skip, so the number does not move. A
     * paused rule is left to resumeRule, and a schedule change to
     * renumberIfRescheduled, which starts the new schedule strictly after the
     * edit day (Owner answer of 01/10). Verified by
     * recurringEndOccurrenceIndex.test.ts - "Decision 4 a.", "Decision 4 b.",
     * "Decision 4 c." and "control: monthly -> weekly edit that also clears
     * the end...".
     */
    private reopenIfExtended(
        existing: RecurringTransaction,
        updated: RecurringTransaction,
        now: Date,
    ): RecurringTransaction {
        if (existing.isPaused) return updated;
        const oldEnd = endOccurrenceIndexOf(existing);
        if (oldEnd === null) return updated;
        const newEnd = endOccurrenceIndexOf(updated);
        if (newEnd !== null && newEnd <= oldEnd) return updated;

        const stored = existing.lastGeneratedIndex ?? deriveLastGeneratedIndex(existing);
        if (stored < oldEnd) return updated;

        return {
            ...updated,
            lastGeneratedIndex: Math.max(stored, lastOccurrenceIndexBefore(updated, now)),
        };
    }

    /**
     * Keep the occurrence key meaningful across an edit of the schedule, and
     * make the edit apply going forward (REGISTRE V-105, Owner decisions 1 and 4).
     *
     * Occurrence numbers count from startDate along one schedule. Once the
     * frequency or the interval changes (startDate cannot be edited today, but
     * is compared too), number k names a different day than it did, so:
     *  - scheduleVersion is incremented: the new schedule's keys can then
     *    never collide with a row the old schedule already wrote;
     *  - lastGeneratedIndex becomes the last occurrence of the NEW schedule on
     *    or before a fence day, read in the current zone:
     *     - active rule: the later of the edit day and lastSettledDay. Everything
     *       due under the stored rule has been recorded first (editRecurringRule),
     *       so the new schedule starts strictly after the edit day and never on a
     *       day already debited. Verified by recurringEditPauseForward.test.ts -
     *       "e. monthly -> weekly edit saved on 20 Sep...", "b1." and "a1." to
     *       "a4.", and recurringOccurrenceKey.test.ts - "V-98 e";
     *     - paused rule: lastSettledDay alone. Nothing is due while paused, and
     *       resumeRule moves the number to the resume day. Verified by
     *       recurringEditPauseForward.test.ts - "k. paused on 20 Sep, edited...".
     * The number changes numbering with the version; within one version it
     * never decreases. The end number is read again in the new numbering
     * (endOccurrenceIndexForEdit, applied by updateFromDTO before this);
     * verified by recurringEndOccurrenceIndex.test.ts - "control: monthly ->
     * weekly edit on 20 Oct of a rule ending 30 Nov...".
     */
    private renumberIfRescheduled(
        existing: RecurringTransaction,
        updated: RecurringTransaction,
        now: Date,
    ): RecurringTransaction {
        const rescheduled =
            updated.frequency !== existing.frequency ||
            updated.interval !== existing.interval ||
            updated.startDate.getTime() !== existing.startDate.getTime();
        if (!rescheduled) return updated;

        const settled = lastSettledDay(existing);
        const editDay = startOfDay(now);
        const fence = existing.isPaused || settled.getTime() > editDay.getTime() ? settled : editDay;

        return {
            ...updated,
            scheduleVersion: (existing.scheduleVersion ?? 0) + 1,
            lastGeneratedIndex: lastOccurrenceIndexOnOrBefore(updated, fence),
        };
    }

    /**
     * Set the paused flag, nothing else. The app pauses through
     * pauseRecurringRule, which first records what is due (REGISTRE V-105).
     */
    async pauseRule(id: string): Promise<RecurringTransaction> {
        const rule = await this.getById(id);
        if (!rule) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${id} not found`);
        }
        return this.update({ ...rule, isPaused: true });
    }

    /**
     * Resume a paused rule without catching up its paused period (REGISTRE
     * V-105, Owner decisions 3 and 6): nothing was due while it was paused,
     * and the next occurrence is the first schedule date on or after the local
     * day of the resume. The number only moves forward, so an occurrence
     * already generated on the resume day is not generated again. This holds
     * for a rule paused before 1.1.3 as well - an accepted exception to policy
     * no. 10. Verified by recurringEditPauseForward.test.ts - "g.", "h.",
     * "control: l." and "policy no. 10 exception (REGISTRE V-105, Owner
     * decision 6)...".
     */
    async resumeRule(id: string, now: Date = new Date()): Promise<RecurringTransaction> {
        const rule = await this.getById(id);
        if (!rule) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${id} not found`);
        }
        if (!rule.isPaused) return rule;

        const stored = rule.lastGeneratedIndex ?? deriveLastGeneratedIndex(rule);
        return this.update({
            ...rule,
            isPaused: false,
            lastGeneratedIndex: Math.max(stored, lastOccurrenceIndexBefore(rule, now)),
        });
    }

    /**
     * Record that occurrence `index` of a rule is in the ledger. Meant to run
     * inside the same database transaction as that occurrence's insert and
     * balance update, so the three commit or roll back together. Verified by
     * recurringOccurrenceKey.test.ts - "interrupted run: a failed watermark
     * write leaves no occurrence behind to be written again".
     *
     * One targeted UPDATE, not a read-modify-write of the whole row. The number
     * only moves forward: a lower one - from a run that lost a race to another
     * - leaves the row as it is (recurringOccurrenceKey.test.ts - "overlapping
     * runs: two concurrent engine runs write each occurrence once").
     * lastGeneratedDate is still written, as the day of that occurrence, so
     * older readers and backups keep their meaning.
     *
     * `scheduleVersion` is the version the occurrence was numbered under. A
     * number only means something in its own numbering, so a row saved under
     * another version since is left as it is (REGISTRE V-115). The engine
     * checks the stored rule before writing anyway; this keeps the write
     * itself from crossing numberings. Verified by
     * recurringStaleEngineCopy.test.ts - "a. S1...".
     */
    async recordGeneratedOccurrence(id: string, scheduleVersion: number, index: number, date: Date): Promise<void> {
        const { rowsAffected } = await this.db.execute(
            `UPDATE recurring_rules SET last_generated_index = ?, last_generated_date = ?
             WHERE id = ? AND schedule_version = ? AND (last_generated_index IS NULL OR last_generated_index < ?)`,
            [index, date.toISOString(), id, scheduleVersion, index],
        );
        if (rowsAffected === 0 && !(await sqlExists(this.db, recurringMapper, id))) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${id} not found`);
        }
    }

    async updateLastGeneratedDate(id: string, date: Date): Promise<RecurringTransaction> {
        const rule = await this.getById(id);
        if (!rule) {
            throw new RepositoryError(RepositoryErrorType.NOT_FOUND, `Recurring rule with id ${id} not found`);
        }
        return this.update({ ...rule, lastGeneratedDate: date });
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    /**
     * Step one interval backwards from `date` to place the initial watermark.
     *
     * `date` is always the rule's startDate, so its day of the month IS the anchor day.
     * Monthly and yearly steps go through addMonthsClamped: stepping back a month from
     * 31 March lands on the last day of February, not on 3 March, which is where
     * setMonth's silent overflow used to put it. Same clamping rule as the forward
     * direction in the engine - see addMonthsClamped.
     */
    private computeDateBefore(date: Date, frequency: string, interval: number): Date {
        const anchorDay = date.getDate();
        const d = new Date(date);
        switch (frequency) {
            case 'daily':
                d.setDate(d.getDate() - interval);
                break;
            case 'weekly':
                d.setDate(d.getDate() - 7 * interval);
                break;
            case 'monthly':
                return addMonthsClamped(date, -interval, anchorDay);
            case 'yearly':
                return addMonthsClamped(date, -12 * interval, anchorDay);
        }
        return d;
    }
}
