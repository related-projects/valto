/**
 * Recurring Rule Status Tests
 *
 * One status per rule, derived from the rule plus its two references. These
 * tests pin the precedence order and the two fault states that the rules screen
 * had no way to show: a rule can sit in the list reading "Active" and generate
 * nothing at all.
 */

import { CategoryType, type Category } from '../entities/Category';
import { TransactionType } from '../entities/Transaction';
import { WalletType, type Wallet } from '../entities/Wallet';
import { RecurrenceFrequency, type RecurringTransaction } from '../entities/RecurringTransaction';
import {
    RecurringRuleStatus,
    checkInsufficientFunds,
    deriveRecurringRuleStatus,
    deriveScheduleStatus,
} from '../recurring';

/** Create a local-timezone date (avoids UTC-parsing issues with 'YYYY-MM-DD' strings) */
function localDate(y: number, m: number, d: number): Date {
    return new Date(y, m - 1, d);
}

function rule(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
    return {
        id: 'rule-1',
        type: TransactionType.EXPENSE,
        amount: 100,
        walletId: 'w-1',
        categoryId: 'cat-1',
        description: 'Test subscription',
        startDate: localDate(2026, 1, 1),
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
        lastGeneratedDate: localDate(2025, 12, 1),
        isPaused: false,
        createdAt: localDate(2025, 12, 15),
        ...overrides,
    };
}

function wallet(overrides: Partial<Wallet> = {}): Wallet {
    return {
        id: 'w-1',
        name: 'Cash Wallet',
        balance: 1000000,
        type: WalletType.CASH,
        createdAt: localDate(2025, 1, 1),
        ...overrides,
    };
}

const category: Category = {
    id: 'cat-1',
    name: 'Test Category',
    type: CategoryType.EXPENSE,
};

/** Two occurrences are due on this date for the default fixture (Jan 1 and Feb 1). */
const TODAY = localDate(2026, 2, 10);

describe('deriveRecurringRuleStatus', () => {
    it('reports ACTIVE when the rule can run', () => {
        const status = deriveRecurringRuleStatus(
            rule(),
            { wallet: wallet(), category },
            TODAY,
        );
        expect(status).toBe(RecurringRuleStatus.ACTIVE);
    });

    it('reports PAUSED for a paused rule', () => {
        const status = deriveRecurringRuleStatus(
            rule({ isPaused: true }),
            { wallet: wallet(), category },
            TODAY,
        );
        expect(status).toBe(RecurringRuleStatus.PAUSED);
    });

    // The badge used to read from isPaused alone, so a rule whose endDate had
    // passed rendered "Active" while generating nothing. This is the state that
    // is legitimate and must not be dressed up as a fault.
    it('reports EXPIRED for a rule that today renders as Active', () => {
        const expired = rule({ endDate: localDate(2026, 1, 20) });

        expect(expired.isPaused).toBe(false);
        expect(
            deriveRecurringRuleStatus(expired, { wallet: wallet(), category }, TODAY),
        ).toBe(RecurringRuleStatus.EXPIRED);
    });

    it('reports MISSING_REFERENCE when the wallet is gone', () => {
        const status = deriveRecurringRuleStatus(
            rule(),
            { wallet: null, category },
            TODAY,
        );
        expect(status).toBe(RecurringRuleStatus.MISSING_REFERENCE);
    });

    it('reports MISSING_REFERENCE when the category is gone', () => {
        const status = deriveRecurringRuleStatus(
            rule(),
            { wallet: wallet(), category: null },
            TODAY,
        );
        expect(status).toBe(RecurringRuleStatus.MISSING_REFERENCE);
    });

    it('reports INSUFFICIENT_FUNDS when the cash wallet cannot cover every pending due', () => {
        // Two occurrences pending at 100 each; the wallet holds 150.
        const status = deriveRecurringRuleStatus(
            rule(),
            { wallet: wallet({ balance: 150 }), category },
            TODAY,
        );
        expect(status).toBe(RecurringRuleStatus.INSUFFICIENT_FUNDS);
    });

    it('never reports INSUFFICIENT_FUNDS for a rule with nothing due', () => {
        // Watermark already past today: no occurrence is pending, so an empty
        // wallet is not a funding problem.
        const nothingDue = rule({ lastGeneratedDate: localDate(2026, 3, 1) });
        const status = deriveRecurringRuleStatus(
            nothingDue,
            { wallet: wallet({ balance: 0 }), category },
            TODAY,
        );
        expect(status).toBe(RecurringRuleStatus.ACTIVE);
    });

    describe('precedence', () => {
        it('PAUSED wins over EXPIRED', () => {
            const status = deriveRecurringRuleStatus(
                rule({ isPaused: true, endDate: localDate(2026, 1, 20) }),
                { wallet: wallet(), category },
                TODAY,
            );
            expect(status).toBe(RecurringRuleStatus.PAUSED);
        });

        it('PAUSED wins over MISSING_REFERENCE', () => {
            const status = deriveRecurringRuleStatus(
                rule({ isPaused: true }),
                { wallet: null, category: null },
                TODAY,
            );
            expect(status).toBe(RecurringRuleStatus.PAUSED);
        });

        it('EXPIRED wins over MISSING_REFERENCE', () => {
            const status = deriveRecurringRuleStatus(
                rule({ endDate: localDate(2026, 1, 20) }),
                { wallet: null, category: null },
                TODAY,
            );
            expect(status).toBe(RecurringRuleStatus.EXPIRED);
        });

        it('MISSING_REFERENCE wins over INSUFFICIENT_FUNDS', () => {
            const status = deriveRecurringRuleStatus(
                rule(),
                { wallet: null, category },
                TODAY,
            );
            expect(status).toBe(RecurringRuleStatus.MISSING_REFERENCE);
        });
    });
});

describe('deriveScheduleStatus', () => {
    it('returns null for a rule that is neither paused nor ended', () => {
        expect(deriveScheduleStatus(rule(), TODAY)).toBeNull();
    });

    it('returns PAUSED without consulting any reference', () => {
        expect(deriveScheduleStatus(rule({ isPaused: true }), TODAY)).toBe(
            RecurringRuleStatus.PAUSED,
        );
    });

    it('returns EXPIRED without consulting any reference', () => {
        expect(deriveScheduleStatus(rule({ endDate: localDate(2026, 1, 20) }), TODAY)).toBe(
            RecurringRuleStatus.EXPIRED,
        );
    });

    // The engine works in whole days. A rule ending today has not ended yet.
    it('keeps a rule whose endDate is today out of EXPIRED', () => {
        const endingToday = rule({ endDate: localDate(2026, 2, 10) });
        expect(deriveScheduleStatus(endingToday, localDate(2026, 2, 10))).toBeNull();
    });
});

describe('checkInsufficientFunds', () => {
    const twoDues = [localDate(2026, 1, 1), localDate(2026, 2, 1)];

    it('reports the total cost of every pending due, not one occurrence', () => {
        const shortfall = checkInsufficientFunds(rule(), wallet({ balance: 150 }), twoDues);
        expect(shortfall).toEqual({ totalCost: 200, availableBalance: 150 });
    });

    it('returns null when the balance covers every pending due', () => {
        expect(checkInsufficientFunds(rule(), wallet({ balance: 200 }), twoDues)).toBeNull();
    });

    it('returns null for income rules whatever the balance', () => {
        const income = rule({ type: TransactionType.INCOME, amount: 500 });
        expect(checkInsufficientFunds(income, wallet({ balance: 0 }), twoDues)).toBeNull();
    });

    it('returns null for wallets that may go negative', () => {
        expect(
            checkInsufficientFunds(rule(), wallet({ balance: 0, type: WalletType.BANK }), twoDues),
        ).toBeNull();
        expect(
            checkInsufficientFunds(rule(), wallet({ balance: 0, type: WalletType.SAVINGS }), twoDues),
        ).toBeNull();
    });

    it('guards mobile wallets like cash wallets', () => {
        const shortfall = checkInsufficientFunds(
            rule(),
            wallet({ balance: 0, type: WalletType.MOBILE }),
            twoDues,
        );
        expect(shortfall).toEqual({ totalCost: 200, availableBalance: 0 });
    });

    it('returns null when nothing is due', () => {
        expect(checkInsufficientFunds(rule(), wallet({ balance: 0 }), [])).toBeNull();
    });
});
