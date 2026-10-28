/**
 * The engine's skipped-rule line names the rule, not the money (pass 84b,
 * item 1)
 *
 * A rule skipped for want of funds was logged with the amount it needed and
 * the balance the wallet had. Console output reaches the device log; the rule
 * id and the reason say which rule and why, and the figures stay in the result
 * the caller already receives (result.skipped).
 *
 * Harness as in recurringEngineFundsGuard.test.ts.
 */

import { inspect } from 'util';
import { createTestDb } from '../../../tests/helpers/createTestDb';
import { dataEvents } from '../../core/events/dataEvents';
import { CategoryType } from '../../domain/entities/Category';
import { RecurrenceFrequency } from '../../domain/entities/RecurringTransaction';
import { TransactionType } from '../../domain/entities/Transaction';
import { WalletType } from '../../domain/entities/Wallet';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { RecurringTransactionRepository } from '../repositories/RecurringTransactionRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { WalletRepository } from '../repositories/WalletRepository';
import { processRecurringRules, SkipReason } from '../services/RecurringTransactionEngine';
import type { SqlDatabase } from '../storage/sql/SqlDatabase';

/** First day of the month `monthsBack` months before the current month (local timezone). */
function monthStart(monthsBack: number): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
}

const RULE_AMOUNT = 98765;
const WALLET_BALANCE = 4321;

let db: SqlDatabase;
let consoleSpies: jest.SpyInstance[];

beforeEach(async () => {
    db = await createTestDb({ writeGuard: true });
    await db.runInTransaction(async () => {
        await new CategoryRepository(db).save({ id: 'cat-1', name: 'Rent', type: CategoryType.EXPENSE });
        await new WalletRepository(db).save({
            id: 'w-1',
            name: 'Cash',
            balance: WALLET_BALANCE,
            type: WalletType.CASH,
            createdAt: monthStart(6),
        });
        await new RecurringTransactionRepository(db).save({
            id: 'rule-1',
            type: TransactionType.EXPENSE,
            amount: RULE_AMOUNT,
            walletId: 'w-1',
            categoryId: 'cat-1',
            description: 'Rent',
            startDate: monthStart(2),
            frequency: RecurrenceFrequency.MONTHLY,
            interval: 1,
            lastGeneratedDate: monthStart(3),
            isPaused: false,
            createdAt: monthStart(4),
        });
    });
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
    );
});

afterEach(() => {
    jest.restoreAllMocks();
});

function printed(): string {
    return consoleSpies
        .flatMap((spy) => spy.mock.calls as unknown[][])
        .map((args) => args.map((arg) => (typeof arg === 'string' ? arg : inspect(arg))).join(' '))
        .join('\n');
}

describe('pass 84b item 1. the skipped-rule log', () => {
    it('pass 84b item 1. names the rule and the reason, and neither the amount needed nor the balance', async () => {
        const result = await processRecurringRules({
            recurringRepo: new RecurringTransactionRepository(db),
            transactionRepo: new TransactionRepository(db),
            walletRepo: new WalletRepository(db),
            categoryRepo: new CategoryRepository(db),
            eventBus: dataEvents,
            runInTransaction: db.runInTransaction,
        });

        // The forcing: the rule really was skipped for want of funds.
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].reason).toBe(SkipReason.INSUFFICIENT_FUNDS);
        const { amount, availableBalance } = result.skipped[0];

        const text = printed();
        expect(text).toContain('rule-1');
        expect([String(amount), String(availableBalance)].filter((figure) => text.includes(figure))).toEqual([]);
    });
});
