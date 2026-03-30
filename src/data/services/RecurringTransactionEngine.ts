/**
 * Recurring Transaction Engine
 *
 * Service responsible for evaluating recurring transaction rules
 * and generating missing transactions automatically.
 *
 * Runs on app launch, after migrations, before UI renders.
 *
 * Idempotency:
 * Uses `lastGeneratedDate` as a watermark — only generates transactions
 * for dates strictly after the watermark up to today.
 */

import { TransactionType, type CreateTransactionDTO } from '../../domain/entities/Transaction';
import { RecurrenceFrequency, type RecurringTransaction } from '../../domain/entities/RecurringTransaction';
import type { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import type { TransactionRepository } from '../repositories/TransactionRepository';
import type { WalletRepository } from '../repositories/WalletRepository';
import type { EventBus } from '../../domain/useCases/types';
import { createTransaction } from '../../domain/useCases/createTransaction';

// ─── Types ────────────────────────────────────────────────────────────

export interface RecurringEngineDeps {
    recurringRepo: RecurringTransactionRepository;
    transactionRepo: TransactionRepository;
    walletRepo: WalletRepository;
    eventBus: EventBus;
}

export interface RecurringEngineResult {
    rulesEvaluated: number;
    transactionsGenerated: number;
    errors: Array<{ ruleId: string; error: string }>;
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
        errors: [],
    };

    try {
        const activeRules = await deps.recurringRepo.getActiveRules();
        result.rulesEvaluated = activeRules.length;

        console.log(`[RecurringEngine] Evaluating ${activeRules.length} active rule(s)`);

        for (const rule of activeRules) {
            try {
                const generated = await generateForRule(deps, rule);
                result.transactionsGenerated += generated;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`[RecurringEngine] Error processing rule ${rule.id}: ${message}`);
                result.errors.push({ ruleId: rule.id, error: message });
            }
        }

        console.log(
            `[RecurringEngine] Complete: ${result.transactionsGenerated} transaction(s) generated from ${result.rulesEvaluated} rule(s)`,
        );
    } catch (error) {
        console.error('[RecurringEngine] Fatal error:', error);
    }

    return result;
}

/**
 * Generate all missing transactions for a single rule.
 * Returns the number of transactions generated.
 */
async function generateForRule(
    deps: RecurringEngineDeps,
    rule: RecurringTransaction,
): Promise<number> {
    const today = startOfDay(new Date());
    const dueDates = computeDueDates(rule, today);

    if (dueDates.length === 0) return 0;

    console.log(`[RecurringEngine] Rule ${rule.id}: generating ${dueDates.length} transaction(s)`);

    let lastDate = rule.lastGeneratedDate;

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
            },
            dto,
        );

        lastDate = dueDate;
    }

    // Update watermark
    await deps.recurringRepo.updateLastGeneratedDate(rule.id, lastDate);

    return dueDates.length;
}

// ─── Date Computation ─────────────────────────────────────────────────

/**
 * Compute all due dates for a rule between lastGeneratedDate (exclusive) and today (inclusive).
 * Respects endDate if present.
 */
export function computeDueDates(
    rule: RecurringTransaction,
    today: Date,
): Date[] {
    const dates: Date[] = [];
    const fence = startOfDay(rule.lastGeneratedDate);
    const end = rule.endDate ? startOfDay(rule.endDate) : null;

    // Start from the rule's startDate and step forward
    let cursor = startOfDay(rule.startDate);

    // Safety limit to prevent infinite loops
    const MAX_ITERATIONS = 3650; // ~10 years of daily
    let iterations = 0;

    while (cursor.getTime() <= today.getTime() && iterations < MAX_ITERATIONS) {
        iterations++;

        // Only include dates after the watermark
        if (cursor.getTime() > fence.getTime()) {
            // Respect endDate
            if (end && cursor.getTime() > end.getTime()) {
                break;
            }
            dates.push(new Date(cursor));
        }

        cursor = advanceDate(cursor, rule.frequency, rule.interval);
    }

    return dates;
}

/**
 * Advance a date by the given frequency and interval.
 */
function advanceDate(
    date: Date,
    frequency: RecurrenceFrequency,
    interval: number,
): Date {
    const next = new Date(date);
    switch (frequency) {
        case RecurrenceFrequency.DAILY:
            next.setDate(next.getDate() + interval);
            break;
        case RecurrenceFrequency.WEEKLY:
            next.setDate(next.getDate() + 7 * interval);
            break;
        case RecurrenceFrequency.MONTHLY:
            next.setMonth(next.getMonth() + interval);
            break;
        case RecurrenceFrequency.YEARLY:
            next.setFullYear(next.getFullYear() + interval);
            break;
    }
    return next;
}

/**
 * Strip time component from a Date (midnight UTC-style using local TZ).
 */
function startOfDay(d: Date): Date {
    const result = new Date(d);
    result.setHours(0, 0, 0, 0);
    return result;
}
