/**
 * Domain Use Case Tests
 *
 * Tests use cases directly against InMemoryStorage-backed repositories,
 * verifying pure business logic without React hook involvement.
 */

import { createMockRepositories, type MockRepositoryBundle } from '../../test-utils/mockRepositories';
import { CategoryType, RecurrenceFrequency, TransactionType, WalletType } from '../entities';
import {
    CategoryHasRecurringRulesError,
    createTransaction,
    createWallet,
    deleteCategory,
    deleteTransaction,
    deleteWallet,
    LastWalletError,
    transferFunds,
    TransferDeletionNotSupportedError,
    WalletHasRecurringRulesError,
} from '../useCases';

// ─── Shared test infrastructure ─────────────────────────────────────
// Concrete repositories (real in-memory SQLite) are built by the test-utils
// helper, so this domain test never imports from the data layer directly.

let repos: MockRepositoryBundle;
let transactionRepo: MockRepositoryBundle['transactionRepo'];
let walletRepo: MockRepositoryBundle['walletRepo'];
let categoryRepo: MockRepositoryBundle['categoryRepo'];
let budgetRepo: MockRepositoryBundle['budgetRepo'];
let recurringRepo: MockRepositoryBundle['recurringRepo'];
let eventBus: MockRepositoryBundle['eventBus'];

function getDeps() {
    return {
        transactionRepo,
        walletRepo,
        categoryRepo,
        budgetRepo,
        recurringRepo,
        eventBus,
        runInTransaction: repos.runInTransaction,
    };
}

beforeEach(async () => {
    repos = await createMockRepositories();
    ({ transactionRepo, walletRepo, categoryRepo, budgetRepo, recurringRepo, eventBus } = repos);
});

/**
 * A monthly rule pointing at the given wallet and category.
 *
 * Created unpaused; the tests that need a paused one pause it afterwards, which
 * must not change the guards' answer. The deletion guards count every rule that
 * exists, a wider set than the engine's getActiveRules.
 */
async function createLiveRule(walletId: string, categoryId: string) {
    return recurringRepo.create({
        type: TransactionType.EXPENSE,
        amount: 5000,
        walletId,
        categoryId,
        description: 'Standing order',
        startDate: new Date(),
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
    });
}

// ─── createTransaction ──────────────────────────────────────────────

describe('createTransaction', () => {
    it('debits wallet for expense', async () => {
        const wallet = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });

        const txn = await createTransaction(getDeps(), {
            type: TransactionType.EXPENSE,
            amount: 15000,
            categoryId: 'food',
            walletId: wallet.id,
            date: new Date(),
        });

        expect(txn.amount).toBe(15000);
        const updated = await walletRepo.getById(wallet.id);
        expect(updated!.balance).toBe(85000);
        expect(eventBus.emitMultiple).toHaveBeenCalledWith(['transactions', 'wallets']);
    });

    it('does not re-normalize an already-converted amount (no double ×100)', async () => {
        // UI converts input -> cents once via normalizeAmount; the domain stores
        // those cents verbatim. Passing 1575 (== $15.75 normalized) must stay
        // 1575, never become 157500.
        const wallet = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });

        const txn = await createTransaction(getDeps(), {
            type: TransactionType.EXPENSE,
            amount: 1575,
            categoryId: 'food',
            walletId: wallet.id,
            date: new Date(),
        });

        expect(txn.amount).toBe(1575);
        const updated = await walletRepo.getById(wallet.id);
        expect(updated!.balance).toBe(98425);
    });

    it('credits wallet for income', async () => {
        const wallet = await walletRepo.create({ name: 'Bank', balance: 50000, type: WalletType.BANK });

        await createTransaction(getDeps(), {
            type: TransactionType.INCOME,
            amount: 200000,
            categoryId: 'salary',
            walletId: wallet.id,
            date: new Date(),
        });

        const updated = await walletRepo.getById(wallet.id);
        expect(updated!.balance).toBe(250000);
    });
});

// ─── deleteTransaction ──────────────────────────────────────────────

describe('deleteTransaction', () => {
    it('reverts wallet balance on expense deletion', async () => {
        const wallet = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });

        // Create an expense (debits wallet to 80000)
        const txn = await createTransaction(getDeps(), {
            type: TransactionType.EXPENSE,
            amount: 20000,
            categoryId: 'food',
            walletId: wallet.id,
            date: new Date(),
        });

        // Delete should revert balance back to 100000
        await deleteTransaction(getDeps(), txn.id);

        const updated = await walletRepo.getById(wallet.id);
        expect(updated!.balance).toBe(100000);
        // The number alone would also pass if the row had survived the delete, so
        // assert the audit too: the stored balance must equal what the remaining
        // ledger recomputes to.
        expect(await walletRepo.recomputeBalanceFromLedger(wallet.id)).toBe(updated!.balance);
        expect(eventBus.emitMultiple).toHaveBeenCalledWith(['transactions', 'wallets']);
    });

    it('reverts wallet balance on income deletion', async () => {
        const wallet = await walletRepo.create({ name: 'Bank', balance: 50000, type: WalletType.BANK });

        const txn = await createTransaction(getDeps(), {
            type: TransactionType.INCOME,
            amount: 30000,
            categoryId: 'salary',
            walletId: wallet.id,
            date: new Date(),
        });

        // Balance is now 80000; deleting income should revert to 50000
        await deleteTransaction(getDeps(), txn.id);

        const updated = await walletRepo.getById(wallet.id);
        expect(updated!.balance).toBe(50000);
        expect(await walletRepo.recomputeBalanceFromLedger(wallet.id)).toBe(updated!.balance);
    });

    // A transfer is two rows in two wallets with no column linking them. Deleting
    // one leg leaves the other orphaned, and because each wallet still audits
    // clean against its own ledger, verifyFinancialIntegrity cannot see it. The
    // only safe answer is to refuse.
    describe('transfer legs', () => {
        async function makeTransfer() {
            const source = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });
            const dest = await walletRepo.create({ name: 'Bank', balance: 50000, type: WalletType.BANK });

            await transferFunds(getDeps(), {
                fromWalletId: source.id,
                toWalletId: dest.id,
                amount: 25000,
            });

            const legs = await transactionRepo.getAll();
            // Forget the transfer's own announcement so the assertions below only
            // see what the attempted deletion did.
            eventBus.emitMultiple.mockClear();
            return {
                source,
                dest,
                outgoing: legs.find((tx) => tx.categoryId === 'transfer-out')!,
                incoming: legs.find((tx) => tx.categoryId === 'transfer-in')!,
            };
        }

        it.each([
            ['outgoing', (t: Awaited<ReturnType<typeof makeTransfer>>) => t.outgoing],
            ['incoming', (t: Awaited<ReturnType<typeof makeTransfer>>) => t.incoming],
        ])('refuses to delete the %s leg and leaves both wallets untouched', async (_label, pick) => {
            const transfer = await makeTransfer();

            await expect(deleteTransaction(getDeps(), pick(transfer).id)).rejects.toBeInstanceOf(
                TransferDeletionNotSupportedError,
            );

            // Both wallets keep the balances the transfer left them with...
            expect((await walletRepo.getById(transfer.source.id))!.balance).toBe(75000);
            expect((await walletRepo.getById(transfer.dest.id))!.balance).toBe(75000);
            // ...and both legs are still on the ledger, so neither is orphaned.
            expect(await transactionRepo.getAll()).toHaveLength(2);
            // Nothing was written, so nothing should have been announced.
            expect(eventBus.emitMultiple).not.toHaveBeenCalled();
        });

        it('carries a code the UI can branch on without matching message strings', async () => {
            const transfer = await makeTransfer();

            await expect(deleteTransaction(getDeps(), transfer.outgoing.id)).rejects.toMatchObject({
                code: 'TRANSFER_DELETION_NOT_SUPPORTED',
            });
        });
    });
});

// ─── transferFunds ──────────────────────────────────────────────────

describe('transferFunds', () => {
    it('updates both wallet balances and creates ledger entries', async () => {
        const source = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });
        const dest = await walletRepo.create({ name: 'Bank', balance: 50000, type: WalletType.BANK });

        await transferFunds(getDeps(), {
            fromWalletId: source.id,
            toWalletId: dest.id,
            amount: 25000,
        });

        const updatedSource = await walletRepo.getById(source.id);
        const updatedDest = await walletRepo.getById(dest.id);
        expect(updatedSource!.balance).toBe(75000);
        expect(updatedDest!.balance).toBe(75000);

        // Double-entry: 2 transfer transactions created
        const txns = await transactionRepo.getAll();
        expect(txns).toHaveLength(2);
        expect(txns[0].type).toBe(TransactionType.TRANSFER);
        expect(txns[1].type).toBe(TransactionType.TRANSFER);
    });

    it('rejects transfer with insufficient balance', async () => {
        const source = await walletRepo.create({ name: 'Cash', balance: 10000, type: WalletType.CASH });
        const dest = await walletRepo.create({ name: 'Bank', balance: 50000, type: WalletType.BANK });

        await expect(
            transferFunds(getDeps(), { fromWalletId: source.id, toWalletId: dest.id, amount: 50000 })
        ).rejects.toThrow('Insufficient balance');
    });

    it('rejects same-wallet transfer', async () => {
        const wallet = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });

        await expect(
            transferFunds(getDeps(), { fromWalletId: wallet.id, toWalletId: wallet.id, amount: 5000 })
        ).rejects.toThrow('Source and destination wallets must be different');
    });

    it('rejects zero amount', async () => {
        const source = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });
        const dest = await walletRepo.create({ name: 'Bank', balance: 50000, type: WalletType.BANK });

        await expect(
            transferFunds(getDeps(), { fromWalletId: source.id, toWalletId: dest.id, amount: 0 })
        ).rejects.toThrow('Transfer amount must be greater than 0');
    });
});

// ─── createWallet ───────────────────────────────────────────────────

describe('createWallet', () => {
    it('creates a wallet and emits event', async () => {
        const wallet = await createWallet(getDeps(), {
            name: 'Savings',
            balance: 500000,
            type: WalletType.SAVINGS,
        });

        expect(wallet.name).toBe('Savings');
        expect(wallet.balance).toBe(500000);
        expect(eventBus.emit).toHaveBeenCalledWith('wallets');
    });

    it('rejects empty name', async () => {
        await expect(
            createWallet(getDeps(), { name: '', balance: 0, type: WalletType.CASH })
        ).rejects.toThrow('Wallet name is required');
    });

    it('rejects negative balance', async () => {
        await expect(
            createWallet(getDeps(), { name: 'Bad', balance: -100, type: WalletType.CASH })
        ).rejects.toThrow('Initial balance must be 0 or greater');
    });
});

// ─── deleteCategory ─────────────────────────────────────────────────

describe('deleteCategory', () => {
    /**
     * Two categories, not one: deleting the only category is now refused, so a
     * fixture with a single category would be testing the floor rather than the
     * happy path it is named for.
     */
    it('deletes a category with no references', async () => {
        const cat = await categoryRepo.create({
            name: 'Unused',
            type: CategoryType.EXPENSE,
            color: '#FF0000',
            icon: 'close',
        });
        await categoryRepo.create({
            name: 'Kept',
            type: CategoryType.EXPENSE,
            color: '#00FF00',
            icon: 'cart',
        });

        await deleteCategory(getDeps(), cat.id);

        const all = await categoryRepo.getAll();
        expect(all).toHaveLength(1);
        expect(all[0].name).toBe('Kept');
        expect(eventBus.emit).toHaveBeenCalledWith('categories');
    });

    it('rejects deletion when transactions reference the category', async () => {
        const cat = await categoryRepo.create({
            name: 'Food',
            type: CategoryType.EXPENSE,
            color: '#FF0000',
            icon: 'restaurant',
        });

        const wallet = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });

        await transactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 5000,
            categoryId: cat.id,
            walletId: wallet.id,
            date: new Date(),
        });

        await expect(deleteCategory(getDeps(), cat.id)).rejects.toThrow('Cannot delete category');
    });

    it('rejects deletion when a budget references the category', async () => {
        const cat = await categoryRepo.create({
            name: 'Budgeted',
            type: CategoryType.EXPENSE,
            color: '#FF0000',
            icon: 'wallet',
        });
        await categoryRepo.create({
            name: 'Kept',
            type: CategoryType.EXPENSE,
            color: '#00FF00',
            icon: 'cart',
        });

        // No transaction anywhere: the transaction check passes, and only the
        // budget check stands between this delete and a dangling category_id.
        await budgetRepo.create({ categoryId: cat.id, month: '2026-09', limitAmount: 50000 });

        await expect(deleteCategory(getDeps(), cat.id)).rejects.toThrow(
            'Cannot delete category. It is used in 1 budgets.',
        );

        expect(await categoryRepo.getAll()).toHaveLength(2);
    });

    it('rejects deletion of the last category, even with nothing referencing it', async () => {
        const cat = await categoryRepo.create({
            name: 'Only',
            type: CategoryType.EXPENSE,
            color: '#FF0000',
            icon: 'close',
        });

        await expect(deleteCategory(getDeps(), cat.id)).rejects.toThrow(
            'At least one category is required',
        );

        expect(await categoryRepo.getAll()).toHaveLength(1);
        expect(eventBus.emit).not.toHaveBeenCalledWith('categories');
    });

    it('rejects deletion when a live recurring rule references the category', async () => {
        const cat = await categoryRepo.create({
            name: 'Subscriptions',
            type: CategoryType.EXPENSE,
            color: '#FF0000',
            icon: 'repeat',
        });
        await categoryRepo.create({
            name: 'Kept',
            type: CategoryType.EXPENSE,
            color: '#00FF00',
            icon: 'cart',
        });

        const wallet = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });

        // No transaction and no budget: the two existing reference checks both
        // pass, so only the rule check can refuse this.
        await createLiveRule(wallet.id, cat.id);

        const error = await deleteCategory(getDeps(), cat.id).catch((e: unknown) => e);

        // Behaviour first: the category has to survive. The typed shape below
        // is what the UI needs, but the refusal itself is the regression.
        expect(await categoryRepo.getAll()).toHaveLength(2);
        expect(eventBus.emit).not.toHaveBeenCalledWith('categories');

        expect(error).toBeInstanceOf(CategoryHasRecurringRulesError);
        expect((error as CategoryHasRecurringRulesError).code).toBe('CATEGORY_HAS_RECURRING_RULES');
        expect((error as CategoryHasRecurringRulesError).ruleCount).toBe(1);
    });

    it('rejects deletion when the only rule referencing the category is paused', async () => {
        const cat = await categoryRepo.create({
            name: 'Dormant',
            type: CategoryType.EXPENSE,
            color: '#FF0000',
            icon: 'repeat',
        });
        await categoryRepo.create({
            name: 'Kept',
            type: CategoryType.EXPENSE,
            color: '#00FF00',
            icon: 'cart',
        });

        const wallet = await walletRepo.create({ name: 'Cash', balance: 100000, type: WalletType.CASH });
        const rule = await createLiveRule(wallet.id, cat.id);
        await recurringRepo.pauseRule(rule.id);

        // is_paused says WHEN a rule runs, not whether it exists. A paused rule
        // is still a standing order, and resuming it must not resume it into a
        // category that was deleted while it slept. The guard therefore counts
        // every rule, unlike the engine, which correctly runs active ones only.
        const error = await deleteCategory(getDeps(), cat.id).catch((e: unknown) => e);

        expect(await categoryRepo.getAll()).toHaveLength(2);
        expect(error).toBeInstanceOf(CategoryHasRecurringRulesError);
        expect((error as CategoryHasRecurringRulesError).ruleCount).toBe(1);
    });
});

describe('deleteWallet', () => {
    it('deletes a wallet when another one remains', async () => {
        const doomed = await walletRepo.create({ name: 'Doomed', balance: 1000, type: WalletType.CASH });
        await walletRepo.create({ name: 'Kept', balance: 2000, type: WalletType.BANK });

        await deleteWallet(getDeps(), doomed.id);

        const all = await walletRepo.getAll();
        expect(all).toHaveLength(1);
        expect(all[0].name).toBe('Kept');
        expect(eventBus.emit).toHaveBeenCalledWith('wallets');
    });

    it('refuses to delete the last wallet', async () => {
        const only = await walletRepo.create({ name: 'Only', balance: 1000, type: WalletType.CASH });

        await expect(deleteWallet(getDeps(), only.id)).rejects.toThrow(LastWalletError);

        expect(await walletRepo.getAll()).toHaveLength(1);
        expect(eventBus.emit).not.toHaveBeenCalledWith('wallets');
    });

    it('raises a typed error so the UI can tell the refusal from a storage failure', async () => {
        const only = await walletRepo.create({ name: 'Only', balance: 0, type: WalletType.CASH });

        // A message-string match would pass against a bare `new Error` re-wrap;
        // the code is what survives being rethrown through the hook.
        const error = await deleteWallet(getDeps(), only.id).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(LastWalletError);
        expect((error as LastWalletError).code).toBe('LAST_WALLET');
        expect((error as LastWalletError).name).toBe('LastWalletError');
    });

    it('rejects deletion when a live recurring rule references the wallet', async () => {
        const doomed = await walletRepo.create({ name: 'Doomed', balance: 100000, type: WalletType.CASH });
        await walletRepo.create({ name: 'Kept', balance: 2000, type: WalletType.BANK });

        const cat = await categoryRepo.create({
            name: 'Rent',
            type: CategoryType.EXPENSE,
            color: '#FF0000',
            icon: 'home',
        });

        await createLiveRule(doomed.id, cat.id);

        const error = await deleteWallet(getDeps(), doomed.id).catch((e: unknown) => e);

        // Behaviour first, typed shape second - see the category twin above.
        expect(await walletRepo.getAll()).toHaveLength(2);
        expect(eventBus.emit).not.toHaveBeenCalledWith('wallets');

        expect(error).toBeInstanceOf(WalletHasRecurringRulesError);
        expect((error as WalletHasRecurringRulesError).code).toBe('WALLET_HAS_RECURRING_RULES');
        expect((error as WalletHasRecurringRulesError).ruleCount).toBe(1);
    });

    it('still deletes a wallet that holds transactions - only rules block', async () => {
        const doomed = await walletRepo.create({ name: 'Doomed', balance: 100000, type: WalletType.CASH });
        await walletRepo.create({ name: 'Kept', balance: 2000, type: WalletType.BANK });

        await transactionRepo.create({
            type: TransactionType.EXPENSE,
            amount: 5000,
            categoryId: 'food',
            walletId: doomed.id,
            date: new Date(),
        });

        // The asymmetry is the point: a past transaction may lose its wallet,
        // a standing order may not.
        await deleteWallet(getDeps(), doomed.id);

        expect(await walletRepo.getAll()).toHaveLength(1);
    });

    it('rejects deletion when the only rule referencing the wallet is paused', async () => {
        const doomed = await walletRepo.create({ name: 'Doomed', balance: 100000, type: WalletType.CASH });
        await walletRepo.create({ name: 'Kept', balance: 2000, type: WalletType.BANK });

        const cat = await categoryRepo.create({
            name: 'Rent',
            type: CategoryType.EXPENSE,
            color: '#FF0000',
            icon: 'home',
        });

        const rule = await createLiveRule(doomed.id, cat.id);
        await recurringRepo.pauseRule(rule.id);

        // See the category twin above: pausing is not an escape hatch.
        const error = await deleteWallet(getDeps(), doomed.id).catch((e: unknown) => e);

        expect(await walletRepo.getAll()).toHaveLength(2);
        expect(error).toBeInstanceOf(WalletHasRecurringRulesError);
        expect((error as WalletHasRecurringRulesError).ruleCount).toBe(1);
    });
});
