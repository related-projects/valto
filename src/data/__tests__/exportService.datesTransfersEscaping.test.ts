import { TransactionType, type Transaction } from '../../domain/entities/Transaction';
import { WalletType, type Wallet } from '../../domain/entities/Wallet';
import { CategoryType, type Category } from '../../domain/entities/Category';
import { getCurrencyByCode } from '../../domain/constants/currencies';
import { TRANSFER_IN_CATEGORY_ID, TRANSFER_OUT_CATEGORY_ID } from '../../domain/ledger/transferCategories';
import i18n from '../../localization/i18n';
import { formatAmount } from '../../utils/formatAmount';
import { MISSING_CATEGORY_LABEL_KEY } from '../../utils/missingCategory';
import { generateCSV, generateReportHTML } from '../services/export/TransactionExportService';

/**
 * Export regression tests: CSV dates, PDF transfer legs, escaped text
 * (audit-export-spicy-snail, decisions D1-D5)
 *
 * T1 The CSV date is the device's local day. The recurring engine stores local
 *    midnight, so east of Greenwich the UTC day it used to print was the
 *    previous one.
 * T2 A CSV field holding a lone carriage return is quoted.
 * T3 In the PDF a transfer leg takes its sign and colour from the ledger and a
 *    label of its own; income and expense rows and the totals are unchanged.
 *    Expected labels are read from the bundles through i18n.getFixedT.
 * T4 Every user-entered value in the PDF is HTML-escaped, so a name or a note
 *    cannot add, close or break a table row.
 *
 * Nothing here reads the machine time zone. jest gives each test file a copied
 * process.env, so assigning TZ would never reach Node. T1 builds its instant
 * with Date.UTC and gives that one Date the local getters of Africa/Lagos, read
 * from the ICU tz database: dateInZone is the helper of
 * exportService.language.test.ts T3, copied unchanged. The other fixtures are
 * Date.UTC instants whose printed dates are never asserted.
 */

/**
 * A Date for the instant `utcMs` whose local getters report the wall clock of
 * `timeZone`, independent of the zone the process runs in.
 */
function dateInZone(utcMs: number, timeZone: string): Date {
    const date = new Date(utcMs);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23',
    }).formatToParts(date);
    const field = (type: Intl.DateTimeFormatPartTypes): number =>
        Number(parts.find(part => part.type === type)?.value);

    const year = field('year');
    const monthIndex = field('month') - 1;
    const day = field('day');
    const hours = field('hour');
    const minutes = field('minute');
    const wallClockAsUtc = Date.UTC(year, monthIndex, day, hours, minutes, date.getUTCSeconds(), date.getUTCMilliseconds());
    const offsetMinutes = -(wallClockAsUtc - utcMs) / 60000;

    return Object.assign(date, {
        getFullYear: () => year,
        getMonth: () => monthIndex,
        getDate: () => day,
        getHours: () => hours,
        getMinutes: () => minutes,
        getTimezoneOffset: () => offsetMinutes,
    });
}

/** The body of the report table, from <tbody> to </tbody>. */
function tableBody(html: string): string {
    return html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
}

/**
 * One entry per row of the table body. Cells run date, type, amount, wallet,
 * category, note; the amount cell carries the colour in its style attribute
 * and the sign as its first character.
 */
function rowFacts(html: string) {
    return tableBody(html).split('<tr>').slice(1).map(row => {
        const cells = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
        return {
            wallet: cells[3][2],
            category: cells[4][2],
            sign: cells[2][2].charAt(0),
            color: /color: (#[0-9a-f]{6})/.exec(cells[2][1])?.[1],
        };
    });
}

// --- Fixtures ----------------------------------------------------------------

const usd = getCurrencyByCode('USD');

const INCOME_GREEN = '#22c55e';
const EXPENSE_RED = '#ef4444';

const TRANSFER_IN_KEY = 'export.report.transferIn';
const TRANSFER_OUT_KEY = 'export.report.transferOut';

const wallets: Wallet[] = [
    { id: 'w-1', name: 'Caisse', balance: 0, type: WalletType.CASH, createdAt: new Date(Date.UTC(2026, 0, 1)) },
    { id: 'w-2', name: 'Banque', balance: 0, type: WalletType.BANK, createdAt: new Date(Date.UTC(2026, 0, 1)) },
];

const categories: Category[] = [
    { id: 'cat-1', name: 'Nourriture', type: CategoryType.EXPENSE },
    { id: 'cat-2', name: 'Salaire', type: CategoryType.INCOME },
];

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
    return {
        id: 'tx-1',
        type: TransactionType.EXPENSE,
        amount: 5000,
        walletId: 'w-1',
        categoryId: 'cat-1',
        date: new Date(Date.UTC(2026, 1, 15, 12, 0)),
        createdAt: new Date(Date.UTC(2026, 1, 15, 12, 0)),
        ...overrides,
    };
}

// --- Tests -------------------------------------------------------------------

describe('generateCSV - local day and quoting', () => {
    it('T1: a recurring row at local midnight on the 1st in UTC+1 prints that day, not the previous one', () => {
        // 1 March 00:00 in Lagos, the instant the recurring engine stores for a rule due that day.
        const date = dateInZone(Date.UTC(2026, 1, 28, 23, 0), 'Africa/Lagos');
        expect(date.toISOString()).toBe('2026-02-28T23:00:00.000Z');
        expect(date.getTimezoneOffset()).toBe(-60);
        expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 2, 1]);
        expect([date.getHours(), date.getMinutes()]).toEqual([0, 0]);

        const csv = generateCSV([makeTx({ date, createdAt: date })], wallets, categories, usd, i18n.getFixedT('en'));
        const dateField = csv.split('\n')[1].split(',')[0];

        expect(dateField).toBe('2026-03-01');
    });

    it('T2: a note holding a lone carriage return is quoted', () => {
        const csv = generateCSV([makeTx({ note: 'line one\rline two' })], wallets, categories, usd, i18n.getFixedT('en'));

        expect(csv).toContain('"line one\rline two"');
    });
});

describe('generateReportHTML - transfer legs and escaped text', () => {
    it('T3: a transfer prints its incoming leg + in green and its outgoing leg - in red, each with its fr label', () => {
        const tFr = i18n.getFixedT('fr');
        const tEn = i18n.getFixedT('en');
        // transferFunds writes both legs with one amount and one instant.
        const transferredAt = new Date(Date.UTC(2026, 1, 12, 12, 0));
        const transactions = [
            makeTx({ id: 'i-1', type: TransactionType.INCOME, amount: 200000, categoryId: 'cat-2', date: new Date(Date.UTC(2026, 1, 10, 12, 0)) }),
            makeTx({ id: 'e-1', type: TransactionType.EXPENSE, amount: 5000, categoryId: 'cat-1', date: new Date(Date.UTC(2026, 1, 11, 12, 0)) }),
            makeTx({ id: 't-out', type: TransactionType.TRANSFER, amount: 30000, walletId: 'w-1', categoryId: TRANSFER_OUT_CATEGORY_ID, note: 'Transfer to Banque', date: transferredAt }),
            makeTx({ id: 't-in', type: TransactionType.TRANSFER, amount: 30000, walletId: 'w-2', categoryId: TRANSFER_IN_CATEGORY_ID, note: 'Transfer from Caisse', date: transferredAt }),
        ];

        const html = generateReportHTML(2026, 2, transactions, wallets, categories, usd, 'comma', 'DD/MM/YYYY', tFr);

        expect(rowFacts(html)).toEqual([
            { wallet: 'Caisse', category: 'Salaire', sign: '+', color: INCOME_GREEN },
            { wallet: 'Caisse', category: 'Nourriture', sign: '-', color: EXPENSE_RED },
            { wallet: 'Caisse', category: tFr(TRANSFER_OUT_KEY), sign: '-', color: EXPENSE_RED },
            { wallet: 'Banque', category: tFr(TRANSFER_IN_KEY), sign: '+', color: INCOME_GREEN },
        ]);

        // Two distinct French labels: not a missing key echoed back, not the English fallback.
        for (const key of [TRANSFER_IN_KEY, TRANSFER_OUT_KEY]) {
            expect(tFr(key)).not.toBe(key);
            expect(tFr(key)).not.toBe(tEn(key));
        }
        expect(tFr(TRANSFER_IN_KEY)).not.toBe(tFr(TRANSFER_OUT_KEY));

        // The totals leave the transfer out.
        const money = (minor: number) => formatAmount(minor, usd.symbol, 'comma', usd.decimals);
        expect(html).toContain(`<div class="stat-value" style="color: ${INCOME_GREEN};">+${money(200000)}</div>`);
        expect(html).toContain(`<div class="stat-value" style="color: ${EXPENSE_RED};">-${money(5000)}</div>`);
        expect(html).toContain(`<div class="stat-value" style="color: ${INCOME_GREEN};">+${money(195000)}</div>`);
    });

    it('T4: user text is escaped, so a wallet name or a note cannot add or close a table row', () => {
        const markupWallets: Wallet[] = [
            { id: 'w-1', name: 'Cash & Co <Main>', balance: 0, type: WalletType.CASH, createdAt: new Date(Date.UTC(2026, 0, 1)) },
        ];
        const markupCategories: Category[] = [
            { id: 'cat-1', name: `Rock 'n' "Roll"`, type: CategoryType.EXPENSE },
        ];
        const transactions = [
            makeTx({ id: 'e-1', note: '</td></tr></table><h1>X</h1>', date: new Date(Date.UTC(2026, 1, 10, 12, 0)) }),
            // No wallet row for this id: the wallet cell falls back to the id, escaped as well.
            // The category cell no longer falls back to its id - since V-64 an
            // unresolved category prints the translated label - so the id below
            // is kept only to prove it is NOT echoed.
            makeTx({ id: 'e-2', walletId: 'w-<gone>', categoryId: `cat-"gone'`, date: new Date(Date.UTC(2026, 1, 11, 12, 0)) }),
        ];

        const html = generateReportHTML(
            2026, 2, transactions, markupWallets, markupCategories, usd, 'dot', 'YYYY-MM-DD', i18n.getFixedT('en'),
        );

        expect(html).toContain('<td>Cash &amp; Co &lt;Main&gt;</td>');
        expect(html).toContain('<td>&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;&lt;h1&gt;X&lt;/h1&gt;</td>');
        expect(html).toContain('<td>Rock &#39;n&#39; &quot;Roll&quot;</td>');
        expect(html).toContain('<td>w-&lt;gone&gt;</td>');
        // The unresolved category shows the label, and its id reaches the page
        // in neither raw nor escaped form.
        expect(html).toContain(`<td>${i18n.getFixedT('en')(MISSING_CATEGORY_LABEL_KEY)}</td>`);
        expect(html).not.toContain('cat-&quot;gone&#39;');
        expect(html).not.toContain(`cat-"gone'`);
        expect(html).not.toContain('<h1>X</h1>');

        // The given note closes a row without opening one, so both tags are counted.
        const body = tableBody(html);
        expect(body.match(/<tr>/g) ?? []).toHaveLength(transactions.length);
        expect(body.match(/<\/tr>/g) ?? []).toHaveLength(transactions.length);
    });
});
