/**
 * Exports - a transfer note's prefix is written in the export language
 *
 * REGISTRE C38, Owner decisions 24/11, decision 1, option A. transferFunds
 * stores "Transfer to <wallet>" / "Transfer from <wallet>" (+ " - <typed note>")
 * in English, and the CSV description column and the PDF note cell printed it
 * raw in a French export. Both now show the prefix in the export language, like
 * the detail screen; the wallet name and the typed note are kept as stored, and
 * a note that is not a transfer leg's own prefix is never changed (controls).
 *
 * French strings here are ASCII ("Transfert vers"). The incoming prefix is
 * read from fr.json (pass 101b item 6 changed its value).
 */

import { getCurrencyByCode } from '../../domain/constants/currencies';
import { CategoryType, type Category } from '../../domain/entities/Category';
import { TransactionType, type Transaction } from '../../domain/entities/Transaction';
import { WalletType, type Wallet } from '../../domain/entities/Wallet';
import { TRANSFER_IN_CATEGORY_ID, TRANSFER_OUT_CATEGORY_ID } from '../../domain/ledger/transferCategories';
import i18n from '../../localization/i18n';
import frBundle from '../../localization/locales/fr.json';
import { generateCSV, generateReportHTML } from '../services/export/TransactionExportService';

const usd = getCurrencyByCode('USD');
const fr = i18n.getFixedT('fr');
const en = i18n.getFixedT('en');
/** The French incoming-leg prefix, as fr.json holds it. */
const FR_FROM = frBundle.transactions.transferNote.from;

const wallets: Wallet[] = [
    { id: 'w-1', name: 'Caisse', balance: 0, type: WalletType.CASH, createdAt: new Date(2026, 0, 1) },
    { id: 'w-2', name: 'Banque', balance: 0, type: WalletType.BANK, createdAt: new Date(2026, 0, 1) },
];
const categories: Category[] = [{ id: 'cat-1', name: 'Food', type: CategoryType.EXPENSE }];

const at = (day: number) => new Date(2026, 1, day, 12, 0);

const transactions: Transaction[] = [
    { id: 'out', type: TransactionType.TRANSFER, amount: 1000, walletId: 'w-1', categoryId: TRANSFER_OUT_CATEGORY_ID, note: 'Transfer to Banque - loyer', date: at(10), createdAt: at(10) },
    { id: 'in', type: TransactionType.TRANSFER, amount: 1000, walletId: 'w-2', categoryId: TRANSFER_IN_CATEGORY_ID, note: 'Transfer from Caisse - loyer', date: at(10), createdAt: at(10) },
    { id: 'exp', type: TransactionType.EXPENSE, amount: 500, walletId: 'w-1', categoryId: 'cat-1', note: 'Transfer to Mum', date: at(11), createdAt: at(11) },
];

const csvDescriptions = (csv: string): string[] => csv.split('\n').slice(1).map(line => line.split(',').slice(6).join(','));

const pdfNoteCells = (html: string): string[] =>
    [...html.matchAll(/<tr>\s*(?:<td[^>]*>.*?<\/td>\s*){5}<td>(.*?)<\/td>\s*<\/tr>/gs)].map(match => match[1]);

describe('C38 generateCSV description column', () => {
    it('fr: transfer legs carry the French prefix, the expense note is unchanged', () => {
        expect(csvDescriptions(generateCSV(transactions, wallets, categories, usd, fr))).toEqual([
            'Transfert vers Banque - loyer',
            `${FR_FROM} Caisse - loyer`,
            'Transfer to Mum',
        ]);
    });

    it('control: en is the stored text byte for byte', () => {
        expect(csvDescriptions(generateCSV(transactions, wallets, categories, usd, en))).toEqual([
            'Transfer to Banque - loyer',
            'Transfer from Caisse - loyer',
            'Transfer to Mum',
        ]);
    });
});

describe('C38 generateReportHTML note cell', () => {
    it('fr: transfer legs carry the French prefix, the expense note is unchanged', () => {
        const html = generateReportHTML(2026, 2, [...transactions], wallets, categories, usd, 'space', 'DD/MM/YYYY', fr);
        expect(pdfNoteCells(html)).toEqual([
            'Transfert vers Banque - loyer',
            `${FR_FROM} Caisse - loyer`,
            'Transfer to Mum',
        ]);
    });

    it('fr: the prefix is translated and the rest of the note is still escaped', () => {
        const tx: Transaction = { ...transactions[0], note: 'Transfer to <b>X</b> & Co' };
        const html = generateReportHTML(2026, 2, [tx], wallets, categories, usd, 'space', 'DD/MM/YYYY', fr);
        expect(pdfNoteCells(html)).toEqual(['Transfert vers &lt;b&gt;X&lt;/b&gt; &amp; Co']);
    });
});
