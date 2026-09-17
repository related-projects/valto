import { TransactionType, type Transaction } from '../../domain/entities/Transaction';
import { WalletType, type Wallet } from '../../domain/entities/Wallet';
import { CategoryType, type Category } from '../../domain/entities/Category';
import { getCurrencyByCode } from '../../domain/constants/currencies';
import i18n from '../../localization/i18n';
import { formatAmount } from '../../utils/formatAmount';
import { generateReportHTML } from '../services/export/TransactionExportService';

/**
 * PDF report language tests (REGISTRE V-78)
 *
 * The report must speak the APP language and never the device locale. The
 * device locale is simulated by rerouting the implicit locale ('default' or
 * undefined) of Date.prototype.toLocaleString / toLocaleDateString to a tag the
 * test chooses, so a formatter that still reads the device shows up as the wrong
 * language. Expected localized strings are read from the bundles through
 * i18n.getFixedT, never restated here.
 *
 * The day-shift test cannot set the process time zone: jest gives each test
 * file a copied process.env (jest-util createProcessObject, createProcessEnv),
 * so assigning TZ never reaches the real env setter that makes Node re-read the
 * zone. It builds the instant with Date.UTC instead and gives that one Date the
 * local getters of Africa/Lagos (UTC+1, no DST), read from the ICU tz database
 * through Intl.DateTimeFormat with an explicit timeZone. Nothing depends on the
 * machine zone, and toISOString / the UTC getters stay native.
 */

const originalToLocaleString = Date.prototype.toLocaleString;
const originalToLocaleDateString = Date.prototype.toLocaleDateString;

let deviceLocale = 'en-US';

function routeImplicitLocale(locales: Intl.LocalesArgument): Intl.LocalesArgument {
    return locales === undefined || locales === 'default' ? deviceLocale : locales;
}

beforeAll(() => {
    jest.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function (
        this: Date,
        locales?: Intl.LocalesArgument,
        options?: Intl.DateTimeFormatOptions,
    ) {
        return originalToLocaleString.call(this, routeImplicitLocale(locales), options);
    });
    jest.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (
        this: Date,
        locales?: Intl.LocalesArgument,
        options?: Intl.DateTimeFormatOptions,
    ) {
        return originalToLocaleDateString.call(this, routeImplicitLocale(locales), options);
    });
});

afterAll(() => {
    jest.restoreAllMocks();
});

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

// --- Fixtures ----------------------------------------------------------------

const usd = getCurrencyByCode('USD');

// Names carry no English word, so any English found in the output is a label.
const wallets: Wallet[] = [
    { id: 'w-1', name: 'Caisse', balance: 0, type: WalletType.CASH, createdAt: new Date(2026, 0, 1) },
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
        date: new Date(2026, 1, 15, 12, 0),
        createdAt: new Date(2026, 1, 15, 12, 0),
        ...overrides,
    };
}

function sampleTransactions(): Transaction[] {
    return [
        makeTx({ id: 'i-1', type: TransactionType.INCOME, amount: 200050, categoryId: 'cat-2' }),
        makeTx({ id: 'e-1', type: TransactionType.EXPENSE, amount: 5000 }),
    ];
}

// Every English literal the uncorrected report hard-coded (inventory I1), plus
// the raw enum values it printed in the type column.
const ENGLISH_LITERALS = [
    'Monthly Report',
    'Generated by Valto',
    'Income',
    'Expenses',
    'Net Balance',
    'Date',
    'Type',
    'Amount',
    'Wallet',
    'Category',
    'Description',
    'No transactions for this month',
    'Valto Financial Report',
    '>income<',
    '>expense<',
];

// --- Tests -------------------------------------------------------------------

describe('generateReportHTML - app language, not device locale', () => {
    it('T1: renders a fr report with no English label, fr month, app date format and app amounts', () => {
        deviceLocale = 'en-US';
        const tFr = i18n.getFixedT('fr');
        const html = generateReportHTML(
            2026, 2, sampleTransactions(), wallets, categories, usd, 'comma', 'DD/MM/YYYY', tFr,
        );
        const emptyHtml = generateReportHTML(
            2026, 2, [], wallets, categories, usd, 'comma', 'DD/MM/YYYY', tFr,
        );

        // A word French writes the same way as English ("Date", "Type",
        // "Description") cannot prove anything by its absence; skip those.
        const tEn = i18n.getFixedT('en');
        const sameInFrench = new Set(
            ['modals.addTransaction.date', 'modals.addTransaction.type', 'export.report.description']
                .filter(key => tFr(key) === tEn(key))
                .map(key => tEn(key)),
        );
        const leaked = ENGLISH_LITERALS
            .filter(literal => !sameInFrench.has(literal))
            .filter(literal => html.includes(literal) || emptyHtml.includes(literal));
        expect(leaked).toEqual([]);

        const frFebruary = tFr('export.months.february');
        expect(frFebruary).not.toBe(tEn('export.months.february'));
        expect(html).toContain(`${frFebruary} 2026`);

        expect(html).toContain('15/02/2026');

        expect(html).toContain(`+${formatAmount(200050, usd.symbol, 'comma', usd.decimals)}`);
        expect(html).toContain(`-${formatAmount(5000, usd.symbol, 'comma', usd.decimals)}`);
        expect(html).toContain(`+${formatAmount(195050, usd.symbol, 'comma', usd.decimals)}`);
    });

    it('T2: an incomplete bundle (zh) falls back to English, never to the device, with no key or empty label', () => {
        deviceLocale = 'fr-FR';
        const tZh = i18n.getFixedT('zh');
        const tEn = i18n.getFixedT('en');
        const html = generateReportHTML(
            2026, 2, sampleTransactions(), wallets, categories, usd, 'dot', 'YYYY-MM-DD', tZh,
        );

        expect(html).toContain(`${tEn('export.months.february')} 2026`);
        expect(html).toContain(tEn('transactions.income'));
        expect(html).toContain(tEn('reports.financialSummary.netBalance'));
        expect(html).toContain(tEn('modals.addTransaction.category'));

        expect(html).not.toMatch(/\b(export|modals|transactions|reports)\.[A-Za-z]/);
        expect(html).not.toMatch(/<th>\s*<\/th>/);
        expect(html).not.toMatch(/<div class="stat-label">\s*<\/div>/);
    });

    it('T3: a transaction at 00:30 local time in UTC+1 prints on its local day', () => {
        deviceLocale = 'en-US';
        const date = dateInZone(Date.UTC(2026, 1, 14, 23, 30), 'Africa/Lagos');
        expect(date.toISOString()).toBe('2026-02-14T23:30:00.000Z');
        expect(date.getTimezoneOffset()).toBe(-60);
        expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 1, 15]);
        expect([date.getHours(), date.getMinutes()]).toEqual([0, 30]);

        const html = generateReportHTML(
            2026, 2, [makeTx({ date, createdAt: date })], wallets, categories, usd, 'dot', 'YYYY-MM-DD',
            i18n.getFixedT('en'),
        );

        expect(html).toContain('2026-02-15');
        expect(html).not.toContain('2026-02-14');
    });
});
