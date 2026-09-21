/**
 * Missing-category label in the export - CSV and PDF (V-64, T5).
 *
 * Both builders used to fall back to the raw category id when a transaction's
 * category no longer resolves, so a phantom printed as a uuid in a file the
 * user opens in a spreadsheet or hands to someone else.
 *
 * D1: both surfaces print components.transactionList.unknown in the app
 * language. The reserved transfer ids are NOT missing categories - they have
 * their own labels and must keep them, which the last two tests pin.
 *
 * These are pure builders, so the language is supplied with getFixedT rather
 * than changeLanguage, as exportService.language.test.ts does.
 */

import { getCurrencyByCode } from '../../domain/constants/currencies';
import { CategoryType, type Category } from '../../domain/entities/Category';
import { TransactionType, type Transaction } from '../../domain/entities/Transaction';
import { WalletType, type Wallet } from '../../domain/entities/Wallet';
import {
    TRANSFER_IN_CATEGORY_ID,
    TRANSFER_OUT_CATEGORY_ID,
} from '../../domain/ledger/transferCategories';
import i18n from '../../localization/i18n';
import { MISSING_CATEGORY_LABEL_KEY } from '../../utils/missingCategory';
import { generateCSV, generateReportHTML } from '../services/export/TransactionExportService';

const tFr = i18n.getFixedT('fr');
const tEn = i18n.getFixedT('en');

const frLabel = tFr(MISSING_CATEGORY_LABEL_KEY);
const usd = getCurrencyByCode('USD');

const MISSING_CATEGORY_ID = 'cat-deleted-long-ago';

const wallets: Wallet[] = [
    { id: 'w-1', name: 'Cash', balance: 5000, type: WalletType.CASH, createdAt: new Date('2026-01-01') },
];

const categories: Category[] = [
    { id: 'cat-1', name: 'Food', type: CategoryType.EXPENSE },
];

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
    return {
        id: 'tx-1',
        type: TransactionType.EXPENSE,
        amount: 5000,
        walletId: 'w-1',
        categoryId: MISSING_CATEGORY_ID,
        // Local noon: the export prints the local day, the 15th in every zone.
        date: new Date(2026, 1, 15, 12, 0),
        createdAt: new Date('2026-02-15'),
        ...overrides,
    };
}

describe('export - a category that no longer resolves', () => {
    it('the fr label differs from en, so the tests below cannot pass on a key echo', () => {
        expect(frLabel).not.toBe(tEn(MISSING_CATEGORY_LABEL_KEY));
        expect(frLabel).not.toBe(MISSING_CATEGORY_LABEL_KEY);
    });

    it('T5: the CSV prints the translated label, not the raw id', () => {
        const csv = generateCSV([makeTx()], wallets, categories, usd, tFr);

        expect(csv).toContain(frLabel);
        expect(csv).not.toContain(MISSING_CATEGORY_ID);
    });

    it('T5: the PDF prints the translated label, not the raw id', () => {
        const html = generateReportHTML(
            2026, 2, [makeTx()], wallets, categories, usd, 'comma', 'DD/MM/YYYY', tFr,
        );

        expect(html).toContain(frLabel);
        expect(html).not.toContain(MISSING_CATEGORY_ID);
    });

    /**
     * GUARD, not a regression test: this passes both before and after the fix,
     * by design. A reserved transfer leg carries no Category row, so the new
     * fallback would capture it and print "Inconnu" over a leg id unless the
     * leg is excluded first. The CSV is the machine-readable export - it emits
     * `tx.type` raw as well - so the leg ids stay exactly as they are today.
     * The raw leg id in a human-read column is recorded in the report as an
     * untouched finding, not changed here.
     */
    it('guard: a transfer leg keeps its raw leg id in the CSV, not the missing label', () => {
        const legs = [
            makeTx({ id: 'tx-out', type: TransactionType.TRANSFER, categoryId: TRANSFER_OUT_CATEGORY_ID }),
            makeTx({ id: 'tx-in', type: TransactionType.TRANSFER, categoryId: TRANSFER_IN_CATEGORY_ID }),
        ];
        const csv = generateCSV(legs, wallets, categories, usd, tFr);

        expect(csv).toContain(TRANSFER_OUT_CATEGORY_ID);
        expect(csv).toContain(TRANSFER_IN_CATEGORY_ID);
        // A reserved leg id is not a missing category and must not borrow its label.
        expect(csv).not.toContain(frLabel);
    });

    /** GUARD, as above: the PDF already labels legs, and must keep doing so. */
    it('guard: a transfer leg keeps its own label in the PDF', () => {
        const legs = [
            makeTx({ id: 'tx-out', type: TransactionType.TRANSFER, categoryId: TRANSFER_OUT_CATEGORY_ID }),
            makeTx({ id: 'tx-in', type: TransactionType.TRANSFER, categoryId: TRANSFER_IN_CATEGORY_ID }),
        ];
        const html = generateReportHTML(
            2026, 2, legs, wallets, categories, usd, 'comma', 'DD/MM/YYYY', tFr,
        );

        expect(html).toContain(tFr('export.report.transferOut'));
        expect(html).toContain(tFr('export.report.transferIn'));
        expect(html).not.toContain(frLabel);
    });

    it('a category that DOES resolve still prints its own name', () => {
        const csv = generateCSV([makeTx({ categoryId: 'cat-1' })], wallets, categories, usd, tFr);

        expect(csv).toContain('Food');
        expect(csv).not.toContain(frLabel);
    });
});
