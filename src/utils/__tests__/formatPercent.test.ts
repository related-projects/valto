import { formatPercentNumber } from '../formatPercent';

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
