/**
 * Recurring Transaction Engine
 *
 * Service responsible for evaluating recurring transaction rules
 * and generating missing transactions automatically.
 *
 * Runs on app launch, after migrations, before UI renders.
 *
 * Idempotency:
 * Uses `lastGeneratedDate` as a watermark - only generates transactions
 * for dates strictly after the watermark up to today.
 *
 * Insufficient Funds Handling:
 * Expense rules targeting cash/mobile wallets are pre-checked before
 * transaction creation. If the wallet cannot cover the total cost of
 * all pending due dates, the rule is skipped (all-or-nothing) and
 * reported as a business outcome - NOT a system error.
 */

import { type CreateTransactionDTO } from '../../domain/entities/Transaction';
import type { RecurringTransaction } from '../../domain/entities/RecurringTransaction';
import type { CategoryRepository } from '../repositories/CategoryRepository';
import type { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import type { TransactionRepository } from '../repositories/TransactionRepository';
import type { WalletRepository } from '../repositories/WalletRepository';
import type { EventBus, RunInTransaction } from '../../domain/useCases/types';
import { createTransaction } from '../../domain/useCases/createTransaction';
import { computeDueDates, startOfDay } from '../../domain/calculations/recurrenceDates';
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
 * Retry processing a single rule by ID.
 * Use after the user has added funds to the wallet.
 * Returns the generation result for that rule.
 */
export async function retryRule(
    deps: RecurringEngineDeps,
    ruleId: string,
): Promise<GenerateResult> {
    const rule = await deps.recurringRepo.getById(ruleId);
    if (!rule) {
        throw new Error(`Recurring rule with id ${ruleId} not found`);
    }

    if (rule.isPaused) {
        throw new Error(`Recurring rule ${ruleId} is paused`);
    }

    return generateForRule(deps, rule);
}

/**
 * Generate all missing transactions for a single rule.
 * Returns the number of transactions generated and any skip info.
 *
 * Pre-checks, in order, and only once something is actually due:
 *  1. Reference integrity - the rule's wallet and category must both still
 *     exist. Applies to every rule type. Throws.
 *  2. Insufficient funds - for expense rules targeting cash/mobile wallets,
 *     verifies the wallet can cover the total cost of all pending dues
 *     BEFORE creating any transactions (all-or-nothing). Skips, does not throw.
 */
async function generateForRule(
    deps: RecurringEngineDeps,
    rule: RecurringTransaction,
): Promise<GenerateResult> {
    const today = startOfDay(new Date());
    const dueDates = computeDueDates(rule, today);

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

    // The watermark advances once per occurrence, immediately after that
    // occurrence has committed.
    //
    // It used to be a single write after the loop. createTransaction commits
    // each occurrence in its own transaction, so a failure on the fourth of six
    // left the first three in the ledger with the watermark still on the old
    // fence: the next run recomputed from that fence and generated all six
    // again. Nothing detects the result - there is no unique constraint on a
    // transaction and no column linking one back to the rule that made it.
    //
    // That stayed latent while a run covered one or two occurrences. The restore
    // now runs a catch-up over however old the backup file is, so a run of five
    // or ten occurrences is ordinary and so is a failure part-way through one.
    //
    // The remaining window is one occurrence wide: a crash between an
    // occurrence's commit and its watermark write re-emits that occurrence, and
    // closing it would take a boundary spanning the ledger write and the rule
    // update.
    for (const dueDate of dueDates) {
        const dto: CreateTransactionDTO = {
            type: rule.type,
            amount: rule.amount,
            walletId: rule.walletId,
            categoryId: rule.categoryId,
            date: dueDate,
            note: rule.description,
        };

        await createTransaction(
            {
                transactionRepo: deps.transactionRepo,
                walletRepo: deps.walletRepo,
                eventBus: deps.eventBus,
                runInTransaction: deps.runInTransaction,
            },
            dto,
        );

        await deps.recurringRepo.updateLastGeneratedDate(rule.id, dueDate);
    }

    return { generated: dueDates.length };
}

// --- Date computation -------------------------------------------------
//
// computeDueDates moved to src/domain/calculations/recurrenceDates so the rules
// screen can ask what is pending for a rule without importing the data layer.
// Re-exported here because it was exported from this module and its callers,
// tests included, still import it from here.
export { computeDueDates } from '../../domain/calculations/recurrenceDates';
