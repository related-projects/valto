/**
 * transferFunds - the date and the note of a transfer (REGISTRE V-129)
 *
 * A transfer entered from the add-transaction form was stored with the
 * instant of the save and a fixed "Transfer to/from <wallet>" note, whatever
 * date the user picked and whatever note the user typed. Owner decision 1
 * (16/11): a transfer keeps the picked date and the typed note; a caller that
 * gives no date (the Dashboard shortcut) records the present instant. Owner
 * decision 17/11: the typed note follows the wallet text, so each leg still
 * names the other wallet - "Transfer to Bank - Rent share". A caller that
 * gives no note, an empty one or a blank one keeps the fixed text alone.
 *
 * The date is the one createTransaction takes: passed to transactionRepo.create
 * as given and checked by validateTransaction when the row is written. The
 * funds check, the balances and the events do not read it.
 */

import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import { createMockRepositories, type MockRepositoryBundle } from '../../test-utils/mockRepositories';
import { TransactionType, WalletType } from '../entities';
import { createTransaction } from '../useCases/createTransaction';
import { InsufficientFundsError } from '../useCases/errors';
import { transferFunds } from '../useCases/transferFunds';

// 2026-10-31T21:34Z: 31 Oct 2026 22:34 in Lagos.
const NOW = Date.UTC(2026, 9, 31, 21, 34);
// 2026-11-01T21:34Z: 1 Nov 2026 22:34 in Lagos.
const PICKED = Date.UTC(2026, 10, 1, 21, 34);

const SOURCE_BALANCE = 100000;
const DEST_BALANCE = 50000;
const AMOUNT = 25000;

describe('V-129 transferFunds date and note', () => {
    let repos: MockRepositoryBundle;
    let sourceId: string;
    let destId: string;

    const deps = () => ({
        transactionRepo: repos.transactionRepo,
        walletRepo: repos.walletRepo,
        eventBus: repos.eventBus,
        runInTransaction: repos.runInTransaction,
    });

    async function legs() {
        const rows = await repos.transactionRepo.getAll();
        return {
            count: rows.length,
            outgoing: rows.find((tx) => tx.categoryId === 'transfer-out'),
            incoming: rows.find((tx) => tx.categoryId === 'transfer-in'),
        };
    }

    async function balances() {
        const source = await repos.walletRepo.getById(sourceId);
        const dest = await repos.walletRepo.getById(destId);
        return { source: source!.balance, dest: dest!.balance };
    }

    beforeEach(async () => {
        pinClock(NOW);
        repos = await createMockRepositories({ writeGuard: true });
        const source = await repos.runInTransaction(() => repos.walletRepo.create({
            name: 'Cash', balance: SOURCE_BALANCE, type: WalletType.CASH,
        }));
        const dest = await repos.runInTransaction(() => repos.walletRepo.create({
            name: 'Bank', balance: DEST_BALANCE, type: WalletType.BANK,
        }));
        sourceId = source.id;
        destId = dest.id;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        restoreZoneClock();
    });

    it('V-129: a given date is stored on both legs', async () => {
        await transferFunds(deps(), {
            fromWalletId: sourceId, toWalletId: destId, amount: AMOUNT, date: new Date(PICKED),
        });

        const { outgoing, incoming } = await legs();
        expect(outgoing!.date.getTime()).toBe(PICKED);
        expect(incoming!.date.getTime()).toBe(PICKED);
    });

    it('V-129: a given note follows the wallet text on both legs', async () => {
        await transferFunds(deps(), {
            fromWalletId: sourceId, toWalletId: destId, amount: AMOUNT, note: 'Rent share',
        });

        const { outgoing, incoming } = await legs();
        expect(outgoing!.note).toBe('Transfer to Bank - Rent share');
        expect(incoming!.note).toBe('Transfer from Cash - Rent share');
    });

    it('V-129: a given note is trimmed before it is joined', async () => {
        await transferFunds(deps(), {
            fromWalletId: sourceId, toWalletId: destId, amount: AMOUNT, note: '  Rent share  ',
        });

        const { outgoing, incoming } = await legs();
        expect(outgoing!.note).toBe('Transfer to Bank - Rent share');
        expect(incoming!.note).toBe('Transfer from Cash - Rent share');
    });

    it('V-129: a blank note keeps the fixed text alone', async () => {
        await transferFunds(deps(), {
            fromWalletId: sourceId, toWalletId: destId, amount: AMOUNT, note: '   ',
        });

        const { outgoing, incoming } = await legs();
        expect(outgoing!.note).toBe('Transfer to Bank');
        expect(incoming!.note).toBe('Transfer from Cash');
    });

    it('V-129: an invalid date is refused like createTransaction refuses it, and nothing is written', async () => {
        // The repository logs the validation failure; keep it out of the run output.
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        let refused: unknown = null;
        try {
            await transferFunds(deps(), {
                fromWalletId: sourceId, toWalletId: destId, amount: AMOUNT, date: new Date(NaN),
            });
        } catch (error) {
            refused = error;
        }

        expect(refused).not.toBeNull();
        expect(String((refused as Error).message)).toContain('Transaction date must be a valid Date');
        expect((await legs()).count).toBe(0);
        expect(await balances()).toEqual({ source: SOURCE_BALANCE, dest: DEST_BALANCE });
        expect(repos.eventBus.emitMultiple).not.toHaveBeenCalled();
    });

    it('control: createTransaction refuses the same invalid date with the same message', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        let refused: unknown = null;
        try {
            await createTransaction(deps(), {
                type: TransactionType.EXPENSE,
                amount: AMOUNT,
                categoryId: 'cat-any',
                walletId: sourceId,
                date: new Date(NaN),
            });
        } catch (error) {
            refused = error;
        }

        expect(refused).not.toBeNull();
        expect(String((refused as Error).message)).toContain('Transaction date must be a valid Date');
        expect((await legs()).count).toBe(0);
        expect((await balances()).source).toBe(SOURCE_BALANCE);
    });

    it('control: with no date both legs carry the present instant', async () => {
        await transferFunds(deps(), { fromWalletId: sourceId, toWalletId: destId, amount: AMOUNT });

        const { outgoing, incoming } = await legs();
        expect(outgoing!.date.getTime()).toBe(NOW);
        expect(incoming!.date.getTime()).toBe(NOW);
    });

    it('control: with no note the legs keep the fixed text', async () => {
        await transferFunds(deps(), { fromWalletId: sourceId, toWalletId: destId, amount: AMOUNT });

        const { outgoing, incoming } = await legs();
        expect(outgoing!.note).toBe('Transfer to Bank');
        expect(incoming!.note).toBe('Transfer from Cash');
    });

    it('control: with an empty note the legs keep the fixed text', async () => {
        await transferFunds(deps(), {
            fromWalletId: sourceId, toWalletId: destId, amount: AMOUNT, note: '',
        });

        const { outgoing, incoming } = await legs();
        expect(outgoing!.note).toBe('Transfer to Bank');
        expect(incoming!.note).toBe('Transfer from Cash');
    });

    it('control: a dated transfer moves the balances by the amount and emits the same events', async () => {
        await transferFunds(deps(), {
            fromWalletId: sourceId, toWalletId: destId, amount: AMOUNT, date: new Date(PICKED), note: 'Rent share',
        });

        expect(await balances()).toEqual({ source: SOURCE_BALANCE - AMOUNT, dest: DEST_BALANCE + AMOUNT });
        expect(repos.eventBus.emitMultiple).toHaveBeenCalledTimes(1);
        expect(repos.eventBus.emitMultiple).toHaveBeenCalledWith(['wallets', 'transactions']);
    });

    it('control: a dated transfer above the source balance is still refused for funds', async () => {
        let refused: unknown = null;
        try {
            await transferFunds(deps(), {
                fromWalletId: sourceId, toWalletId: destId, amount: SOURCE_BALANCE + 1, date: new Date(PICKED),
            });
        } catch (error) {
            refused = error;
        }

        expect(refused).toBeInstanceOf(InsufficientFundsError);
        expect((await legs()).count).toBe(0);
        expect(await balances()).toEqual({ source: SOURCE_BALANCE, dest: DEST_BALANCE });
    });
});
