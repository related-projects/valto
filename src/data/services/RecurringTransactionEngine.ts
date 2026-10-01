/**
 * Recurring Transaction Engine
 *
 * Service responsible for evaluating recurring transaction rules
 * and generating missing transactions automatically.
 *
 * Runs on app launch, after migrations, before UI renders.
 *
 * Idempotency (REGISTRE V-98):
 * Each rule records the number of its last generated occurrence
 * (`lastGeneratedIndex`), counted from startDate and independent of any time
 * zone; only occurrences numbered after it, due on or before today, are
 * generated. Each generated transaction carries its occurrence key (rule,
 * schedule version, number) under a unique index, and the transaction, the
 * wallet balance and the rule's number are written in ONE database
 * transaction. Verified by recurringOccurrenceKey.test.ts - "zone shift...",
 * "interrupted run..." and "unique key...".
 *
 * A rule changed while it is processed (REGISTRE V-115): rules are read with
 * no transaction open, so each occurrence's transaction reads its rule again
 * and writes only while it is unchanged; otherwise the rule is processed again
 * from the stored row. See generateForRule.
 *
 * Insufficient Funds Handling:
 * Expense rules targeting cash/mobile wallets are pre-checked before
 * transaction creation. If the wallet cannot cover the total cost of
 * all pending due dates, the rule is skipped (all-or-nothing) and
 * reported as a business outcome - NOT a system error.
 */

import { type CreateTransactionDTO, TransactionType } from '../../domain/entities/Transaction';
import type { RecurringTransaction } from '../../domain/entities/RecurringTransaction';
import type { CategoryRepository } from '../repositories/CategoryRepository';
import type { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import type { TransactionRepository } from '../repositories/TransactionRepository';
import type { WalletRepository } from '../repositories/WalletRepository';
import type { EventBus, RunInTransaction } from '../../domain/useCases/types';
import { computeDueOccurrences, deriveLastGeneratedIndex, startOfDay } from '../../domain/calculations/recurrenceDates';
import { checkInsufficientFunds } from '../../domain/recurring';

// ─── Types ────────────────────────────────────────────────────────────

export enum SkipReason {
    INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
}

export interface SkippedRule {
    ruleId: string;
    reason: SkipReason;
    walletId: string;
    /** Total amount needed for all pending due dates */
    amount: number;
    /** Wallet balance at the time of evaluation */
    availableBalance: number;
}

export interface RecurringEngineDeps {
    recurringRepo: RecurringTransactionRepository;
    transactionRepo: TransactionRepository;
    walletRepo: WalletRepository;
    /** Needed by the reference pre-check: a rule's category has no constraint behind it. */
    categoryRepo: CategoryRepository;
    eventBus: EventBus;
    runInTransaction: RunInTransaction;
}

export interface RecurringEngineResult {
    rulesEvaluated: number;
    transactionsGenerated: number;
    skipped: SkippedRule[];
    errors: Array<{ ruleId: string; error: string }>;
}

/** Internal result from generating transactions for a single rule */
interface GenerateResult {
    generated: number;
    skipped?: SkippedRule;
}

// ─── Engine ───────────────────────────────────────────────────────────

/**
 * Evaluate all active recurring rules and generate any missing transactions.
 * This is the main entry point called during app bootstrap.
 */
export async function processRecurringRules(
    deps: RecurringEngineDeps,
): Promise<RecurringEngineResult> {
    const result: RecurringEngineResult = {
        rulesEvaluated: 0,
        transactionsGenerated: 0,
        skipped: [],
        errors: [],
    };

    try {
        const activeRules = await deps.recurringRepo.getActiveRules();
        result.rulesEvaluated = activeRules.length;

        console.log(`[RecurringEngine] Evaluating ${activeRules.length} active rule(s)`);

        for (const rule of activeRules) {
            try {
                const genResult = await generateForRule(deps, rule);
                result.transactionsGenerated += genResult.generated;

                if (genResult.skipped) {
                    result.skipped.push(genResult.skipped);
                    // Emit event so UI can refresh - this is a business outcome, not an error
                    deps.eventBus.emit('recurringRules');
                    console.info(
                        `[RecurringEngine] Rule ${rule.id} skipped: ${genResult.skipped.reason} ` +
                        `(need ${genResult.skipped.amount}, have ${genResult.skipped.availableBalance})`,
                    );
                }
            } catch (error) {
                // Only real system failures reach here
                const message = error instanceof Error ? error.message : String(error);
                console.error(`[RecurringEngine] Error processing rule ${rule.id}: ${message}`);
                result.errors.push({ ruleId: rule.id, error: message });
            }
        }

        console.log(
            `[RecurringEngine] Complete: ${result.transactionsGenerated} transaction(s) generated, ` +
            `${result.skipped.length} skipped, from ${result.rulesEvaluated} rule(s)`,
        );
    } catch (error) {
        console.error('[RecurringEngine] Fatal error:', error);
    }

    return result;
}

/**
 * Process a single rule by ID: generate what is due for it up to the local day
 * of `now`. Used after the user has added funds to the wallet, and to record
 * what is due before an edit or a pause (recurringRuleChanges), which passes
 * the same `now` it saves the edit with.
 * Returns the generation result for that rule.
 */
export async function retryRule(
    deps: RecurringEngineDeps,
    ruleId: string,
    now: Date = new Date(),
): Promise<GenerateResult> {
    const rule = await deps.recurringRepo.getById(ruleId);
    if (!rule) {
        throw new Error(`Recurring rule with id ${ruleId} not found`);
    }

    if (rule.isPaused) {
        throw new Error(`Recurring rule ${ruleId} is paused`);
    }

    return generateForRule(deps, rule, now);
}

/**
 * Most times one rule may be found changed - and processed again from the
 * stored rule - in one run (REGISTRE V-115). Past it, the rule is left to the
 * next run. A change here is a save made while the rule was being processed,
 * so more than a few in one run is not expected; the bound only keeps a rule
 * that never stops changing from holding the run. Another run moving the same
 * rule forward is not counted: see compareWithStored.
 */
const MAX_RULE_RESTARTS = 3;

/**
 * Generate all missing transactions for a single rule, up to the local day of
 * `now`. Returns the number of transactions generated and any skip info.
 *
 * `rule` is a copy read with no transaction open, and anything may be saved
 * between that read and a write (REGISTRE V-115): an edit, a pause, a delete,
 * another run. Each occurrence's transaction therefore reads the stored rule
 * before it writes, and writes only while it still matches the copy
 * (generateFromCopy). When it does not, nothing is written in that
 * transaction, and the rule is processed again from the stored rule, for the
 * same day and with its pre-checks - or not at all when it has been deleted
 * or paused. Past MAX_RULE_RESTARTS this throws, and processRecurringRules
 * reports the rule among its errors; what is still due stays due for the next
 * run.
 *
 * Unchecked, a copy read before a schedule change wrote its occurrence number,
 * counted in the old numbering, into the new one - every occurrence up to it
 * was skipped - and across midnight wrote an occurrence of the old schedule
 * after the edit day, a day the new schedule then debited again. Verified by
 * recurringStaleEngineCopy.test.ts - "a. S1...", "b. S2...", "c. a rule
 * paused..." and "bound: ...".
 */
async function generateForRule(
    deps: RecurringEngineDeps,
    rule: RecurringTransaction,
    now: Date = new Date(),
): Promise<GenerateResult> {
    const today = startOfDay(now);
    let copy = rule;
    let generated = 0;
    let restarts = 0;

    for (;;) {
        const pass = await generateFromCopy(deps, copy, today);
        generated += pass.generated;
        if (pass.skipped) return { generated, skipped: pass.skipped };
        if (!pass.changed) return { generated };

        const { stored, advancedOnly } = pass.changed;
        if (stored === null || stored.isPaused) return { generated };
        if (!advancedOnly) {
            restarts++;
            if (restarts > MAX_RULE_RESTARTS) {
                throw new Error(`Rule ${rule.id} changed while it was being processed; left to the next run`);
            }
            console.info(`[RecurringEngine] Rule ${rule.id} changed since it was read; processing it again`);
        }
        copy = stored;
    }
}

/** The stored rule, when it no longer matches the copy being processed. */
interface RuleChange {
    /** Read inside the occurrence's transaction; null when the rule was deleted. */
    stored: RecurringTransaction | null;
    /** Only its last generated number is ahead: another run generated those occurrences. */
    advancedOnly: boolean;
}

/** One pass over a copy of a rule: what it generated, and why it stopped early. */
interface CopyPass extends GenerateResult {
    changed?: RuleChange;
}

/**
 * Generate what is due for one copy of a rule, stopping at the first
 * occurrence whose transaction finds the stored rule different from it.
 *
 * Pre-checks, in order, and only once something is actually due:
 *  1. Reference integrity - the rule's wallet and category must both still
 *     exist. Applies to every rule type. Throws.
 *  2. Insufficient funds - for expense rules targeting cash/mobile wallets,
 *     verifies the wallet can cover the total cost of all pending dues
 *     BEFORE creating any transactions (all-or-nothing). Skips, does not throw.
 */
async function generateFromCopy(
    deps: RecurringEngineDeps,
    rule: RecurringTransaction,
    today: Date,
): Promise<CopyPass> {
    const dueOccurrences = computeDueOccurrences(rule, today);
    const dueDates = dueOccurrences.map((occurrence) => occurrence.date);

    if (dueDates.length === 0) return { generated: 0 };

    // --- Pre-check: reference integrity ---
    //
    // Neither reference has a database constraint behind it, so a rule can
    // outlive its wallet or its category. Both are checked here, for every rule
    // type, before any write:
    //
    //  - the wallet check used to live inside the expense branch below, so an
    //    income rule reached createTransaction and failed inside
    //    walletRepo.updateBalance - after the write transaction had opened and
    //    a transaction row had been inserted, then rolled back;
    //  - the category was checked nowhere at all. validateTransaction only
    //    requires a non-empty string and transactions.category_id has no
    //    constraint, so a rule whose category was deleted did not fail: it
    //    wrote a transaction pointing at a category that does not exist and
    //    advanced the watermark past the occurrence.
    //
    // This throws rather than skipping, pausing or repairing. A skip is a
    // business outcome the user can resolve (add funds); a broken reference is
    // not something the engine may decide for the user, and repairing it would
    // mean silently re-pointing a standing order at some other wallet or
    // category. The throw is caught per rule in processRecurringRules, which
    // leaves the watermark unadvanced - the occurrences stay due, so repairing
    // the reference lets the next run generate them.
    //
    // Placed AFTER the "nothing due" return above: a rule with nothing due must
    // stay silent, broken or not, or every boot would report rules that had no
    // work to do anyway.
    const wallet = await deps.walletRepo.getById(rule.walletId);
    if (!wallet) {
        throw new Error(`Wallet ${rule.walletId} not found for rule ${rule.id}`);
    }

    const category = await deps.categoryRepo.getById(rule.categoryId);
    if (!category) {
        throw new Error(`Category ${rule.categoryId} not found for rule ${rule.id}`);
    }

    // ─── Pre-check: Insufficient funds guard ──────────────────────────
    //
    // Deliberately after the reference check: a rule pointing nowhere is not a
    // funding problem, and reporting it as one would tell the user to add money
    // to a rule that would still never execute afterwards.
    //
    // The decision itself lives in checkInsufficientFunds, in the domain. The
    // rules screen has to answer the same question without running the engine,
    // and two copies of "insufficient" that agree today do not stay agreed. This
    // is the only definition; the engine reads it and keeps its own all-or-
    // nothing grain, which this pass does not change.
    const shortfall = checkInsufficientFunds(rule, wallet, dueDates);
    if (shortfall) {
        return {
            generated: 0,
            skipped: {
                ruleId: rule.id,
                reason: SkipReason.INSUFFICIENT_FUNDS,
                walletId: rule.walletId,
                amount: shortfall.totalCost,
                availableBalance: shortfall.availableBalance,
            },
        };
    }

    // ─── Generate transactions ────────────────────────────────────────
    console.log(`[RecurringEngine] Rule ${rule.id}: generating ${dueDates.length} transaction(s)`);

    // One database transaction per occurrence: the transaction row, the
    // wallet balance and the rule's occurrence number commit together or not
    // at all (REGISTRE V-98).
    //
    // The number used to be a date watermark written AFTER createTransaction
    // had committed the occurrence on its own. A run interrupted between the
    // two left the occurrence in the ledger with the watermark still before
    // it, and the next run wrote it again. Inside one transaction a failure
    // anywhere rolls all three back, and the occurrence stays due. Verified by
    // recurringOccurrenceKey.test.ts - "interrupted run: a failed watermark
    // write leaves no occurrence behind to be written again".
    //
    // Each occurrence still commits on its own, so a failure on the fourth of
    // six keeps the first three and their numbers - see
    // recurringWatermarkPerOccurrence.test.ts.
    //
    // A key already in the ledger means the occurrence was generated before:
    // nothing is written, nothing is debited, no error is raised, and the
    // rule's number still moves past it. Verified by the same file - "unique
    // key: the engine treats a key conflict as already generated...".
    //
    // Each transaction first reads the stored rule (REGISTRE V-115) and
    // writes only if it still matches `expected` - the copy, as this pass's
    // own commits have moved its number. Nothing else can change the row
    // while the transaction is open, so the occurrence, its key and the
    // rule's number are written from the rule as it is stored.
    const scheduleVersion = rule.scheduleVersion ?? 0;
    // The expression createTransaction uses, which generated these rows before.
    const balanceAdjustment = rule.type === TransactionType.EXPENSE ? -rule.amount : rule.amount;
    let generated = 0;
    let expected = rule;

    for (const occurrence of dueOccurrences) {
        const dto: CreateTransactionDTO = {
            type: rule.type,
            amount: rule.amount,
            walletId: rule.walletId,
            categoryId: rule.categoryId,
            date: occurrence.date,
            note: rule.description,
        };

        const outcome = await deps.runInTransaction(async (): Promise<{ written: boolean; changed?: RuleChange }> => {
            const stored = await deps.recurringRepo.getById(rule.id);
            const match = compareWithStored(expected, stored);
            if (match !== 'same') {
                return { written: false, changed: { stored, advancedOnly: match === 'advanced' } };
            }

            const row = await deps.transactionRepo.createRecurringOccurrence(dto, {
                ruleId: rule.id,
                scheduleVersion,
                occurrenceIndex: occurrence.index,
            });
            if (row) {
                await deps.walletRepo.updateBalance(rule.walletId, balanceAdjustment);
            }
            await deps.recurringRepo.recordGeneratedOccurrence(rule.id, scheduleVersion, occurrence.index, occurrence.date);
            return { written: row !== null };
        });

        if (outcome.changed) {
            return { generated, changed: outcome.changed };
        }
        if (outcome.written) {
            generated++;
            // After commit, as createTransaction does.
            deps.eventBus.emitMultiple(['transactions', 'wallets']);
        }
        expected = { ...expected, lastGeneratedIndex: occurrence.index, lastGeneratedDate: occurrence.date };
    }

    return { generated };
}

/** How the stored rule compares with the copy an occurrence was computed from. */
type StoredMatch = 'same' | 'advanced' | 'changed';

/**
 * Compare the stored rule with `expected` on every field that decides what is
 * generated and where (REGISTRE V-115):
 *  - scheduleVersion, frequency, interval, startDate: the numbering and the
 *    days of the occurrences;
 *  - endDate, endOccurrenceIndex: the last occurrence;
 *  - isPaused: whether anything is due at all;
 *  - type, amount, walletId, categoryId: what is debited or credited, and
 *    where;
 *  - description: the generated transaction's note;
 *  - the last generated number, as computeDueOccurrences reads it.
 * Left out: id (the row is read by it), createdAt (never read by generation)
 * and lastGeneratedDate, which generation reads only for a rule with no
 * number - the number compared here is derived from it in that case.
 *
 * 'advanced' is a stored number ahead of `expected` with every other field
 * equal: another run, or an edit's catch-up, generated those occurrences.
 * The rule is processed again from the stored row, but that is not counted
 * against MAX_RULE_RESTARTS: the number only rises, and each such pass leaves
 * fewer occurrences due, so it cannot repeat for ever. Verified by
 * recurringStaleEngineCopy.test.ts - "control: two overlapping runs...".
 */
function compareWithStored(expected: RecurringTransaction, stored: RecurringTransaction | null): StoredMatch {
    if (stored === null || !sameGenerationInputs(expected, stored)) return 'changed';

    const expectedIndex = expected.lastGeneratedIndex ?? deriveLastGeneratedIndex(expected);
    const storedIndex = stored.lastGeneratedIndex ?? deriveLastGeneratedIndex(stored);
    if (storedIndex === expectedIndex) return 'same';
    return storedIndex > expectedIndex ? 'advanced' : 'changed';
}

function sameGenerationInputs(a: RecurringTransaction, b: RecurringTransaction): boolean {
    return (
        (a.scheduleVersion ?? 0) === (b.scheduleVersion ?? 0) &&
        a.frequency === b.frequency &&
        a.interval === b.interval &&
        a.startDate.getTime() === b.startDate.getTime() &&
        a.endDate?.getTime() === b.endDate?.getTime() &&
        a.endOccurrenceIndex === b.endOccurrenceIndex &&
        a.isPaused === b.isPaused &&
        a.type === b.type &&
        a.amount === b.amount &&
        a.walletId === b.walletId &&
        a.categoryId === b.categoryId &&
        a.description === b.description
    );
}

// --- Date computation -------------------------------------------------
//
// computeDueDates moved to src/domain/calculations/recurrenceDates so the rules
// screen can ask what is pending for a rule without importing the data layer.
// Re-exported here because it was exported from this module and its callers,
// tests included, still import it from here.
export { computeDueDates } from '../../domain/calculations/recurrenceDates';
