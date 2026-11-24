/**
 * displayTransactionNote - the one place a transfer note's prefix is translated
 *
 * REGISTRE C38, Owner decisions 24/11, decision 1, option A. The rendered sites
 * (detail screen, CSV, PDF, search) have their own regression tests; this file
 * pins the recognition rule they share, and ties it to the writer: the notes
 * are produced by the real transferFunds, so a change to what it writes that
 * the display no longer recognises fails here. transferFunds itself is not
 * changed by C38; the last test re-reads what it stored.
 *
 * French strings are ASCII ("Transfert vers"). The incoming prefix is read
 * from fr.json (pass 101b item 6 changed its value).
 */

import { createMockRepositories, type MockRepositoryBundle } from '../../test-utils/mockRepositories';
import { TransactionType, WalletType } from '../../domain/entities';
import { transferFunds } from '../../domain/useCases/transferFunds';
import i18n from '../../localization/i18n';
import frBundle from '../../localization/locales/fr.json';
import { displayTransactionNote } from '../transferNote';

const fr = i18n.getFixedT('fr');
const en = i18n.getFixedT('en');
/** An incomplete bundle: it has no transactions.transferNote keys. */
const zh = i18n.getFixedT('zh');
/** The French incoming-leg prefix, as fr.json holds it. */
const FR_FROM = frBundle.transactions.transferNote.from;

const leg = (categoryId: string, note: string | undefined, type = TransactionType.TRANSFER) => ({ type, categoryId, note });

describe('displayTransactionNote - recognition', () => {
    it('translates the prefix of each leg and keeps the rest byte for byte', () => {
        expect(displayTransactionNote(leg('transfer-out', 'Transfer to Bank - rent'), fr)).toBe('Transfert vers Bank - rent');
        expect(displayTransactionNote(leg('transfer-in', 'Transfer from Cash'), fr)).toBe(`${FR_FROM} Cash`);
        expect(displayTransactionNote(leg('transfer-out', 'Transfer to  two  spaces - Transfer to'), fr))
            .toBe('Transfert vers  two  spaces - Transfer to');
    });

    it('en and an incomplete bundle (English fallback) give the stored note back exactly', () => {
        for (const t of [en, zh]) {
            expect(displayTransactionNote(leg('transfer-out', 'Transfer to Bank - rent'), t)).toBe('Transfer to Bank - rent');
            expect(displayTransactionNote(leg('transfer-in', 'Transfer from Cash'), t)).toBe('Transfer from Cash');
        }
    });

    it('control: a note that is not a transfer leg\'s own prefix is never changed', () => {
        const unchanged = [
            leg('cat-food', 'Transfer to Mum', TransactionType.EXPENSE),
            leg('transfer-out', 'Transfer to Mum', TransactionType.EXPENSE),
            leg('transfer-in', 'Transfer to Bank'),
            leg('transfer-out', 'Transfer from Cash'),
            leg('transfer-out', 'transfer to Bank'),
            leg('transfer-out', 'Transfer toBank'),
            leg('transfer-out', 'Paid back'),
            leg('cat-food', 'Transfer to Bank', TransactionType.TRANSFER),
        ];
        for (const tx of unchanged) {
            expect(displayTransactionNote(tx, fr)).toBe(tx.note);
        }
    });

    it('control: an absent note is the empty string', () => {
        expect(displayTransactionNote(leg('transfer-out', undefined), fr)).toBe('');
    });
});

describe('displayTransactionNote - on what transferFunds writes', () => {
    let repos: MockRepositoryBundle;

    beforeEach(async () => {
        repos = await createMockRepositories({ writeGuard: true });
    });

    it('recognises both legs, with and without a typed note, and storage keeps the English prefix', async () => {
        const cash = await repos.runInTransaction(() => repos.walletRepo.create({ name: 'Caisse', balance: 100000, type: WalletType.CASH }));
        const bank = await repos.runInTransaction(() => repos.walletRepo.create({ name: 'Banque', balance: 0, type: WalletType.BANK }));
        const deps = {
            transactionRepo: repos.transactionRepo,
            walletRepo: repos.walletRepo,
            eventBus: repos.eventBus,
            runInTransaction: repos.runInTransaction,
        };

        await transferFunds(deps, { fromWalletId: cash.id, toWalletId: bank.id, amount: 1000, note: 'loyer' });
        await transferFunds(deps, { fromWalletId: bank.id, toWalletId: cash.id, amount: 500 });

        const rows = await repos.transactionRepo.getAll();
        const stored = rows.map(tx => tx.note).sort();
        expect(stored).toEqual([
            'Transfer from Banque',
            'Transfer from Caisse - loyer',
            'Transfer to Banque - loyer',
            'Transfer to Caisse',
        ]);
        expect(rows.map(tx => displayTransactionNote(tx, fr)).sort()).toEqual([
            `${FR_FROM} Banque`,
            `${FR_FROM} Caisse - loyer`,
            'Transfert vers Banque - loyer',
            'Transfert vers Caisse',
        ].sort());
    });
});
