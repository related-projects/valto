import { boundPercentParams, formatPercentNumber, percentOutOfRange } from '../formatPercent';

/**
 * formatPercentNumber - the digits of a percentage
 *
 * Registry V-95. The 1-digit case is covered where it is rendered
 * (FinancialSummary, YtdSummaryCard and BalanceCard percentSeparator tests).
 *
 * The case below is a CONTROL: a 0-digit percentage never carried a separator,
 * so it pins what must not change when the call sites move onto the helper - no
 * decimal character, and no grouping either (V-95 D3), under any profile.
 * Expected strings are written out, not read from numberFormats.ts.
 */

describe('formatPercentNumber', () => {
    it('control: zero digits carry no separator under any profile', () => {
        for (const profile of ['dot', 'comma', 'space'] as const) {
            expect(formatPercentNumber(40, 0, profile)).toBe('40');
            expect(formatPercentNumber(39.6, 0, profile)).toBe('40');
            expect(formatPercentNumber(1250, 0, profile)).toBe('1250');
        }
    });
});

/**
 * REGISTRE C28, Owner decisions 21/11, decision 1: beyond 999 % in either
 * direction a percentage is shown in words. These pin the range rule the
 * display sites share; the rendered strings are covered where they are shown
 * (reports percentLimit, BalanceCard.percentLimit, DashboardScreen.percentLimit).
 */
describe('percentOutOfRange', () => {
    it('is null from -999 to 999 inclusive', () => {
        for (const value of [-999, -998.9, -12.5, 0, 12.5, 998.9, 999]) {
            expect([value, percentOutOfRange(value)]).toEqual([value, null]);
        }
    });

    it('is over above 999 and below under -999, infinities included', () => {
        for (const value of [999.01, 1000, 18002646.4, Infinity]) {
            expect([value, percentOutOfRange(value)]).toEqual([value, 'over']);
        }
        for (const value of [-999.01, -1000, -99999999898.1, -Infinity]) {
            expect([value, percentOutOfRange(value)]).toEqual([value, 'below']);
        }
    });

    it('control: NaN is left to the caller', () => {
        expect(percentOutOfRange(Number.NaN)).toBeNull();
    });
});

describe('boundPercentParams', () => {
    const t = ((key: string, options?: { limit?: string }) => `${key}(${options?.limit})`) as never;

    it('returns the same params when percent is within range or absent', () => {
        const cases: Record<string, string | number>[] = [{}, { percent: 45 }, { percent: '999' }, { percent: -999 }, { category: 'Food' }];
        for (const params of cases) {
            expect(boundPercentParams(params, t)).toBe(params);
        }
    });

    it('replaces only percent when it is beyond 999, keeping the other params', () => {
        expect(boundPercentParams({ percent: 99999999900, category: 'Food' }, t))
            .toEqual({ percent: 'common.percentOver(999)', category: 'Food' });
        expect(boundPercentParams({ percent: 'Infinity' }, t)).toEqual({ percent: 'common.percentOver(999)' });
        expect(boundPercentParams({ percent: '-1000' }, t)).toEqual({ percent: 'common.percentBelow(-999)' });
    });
});
