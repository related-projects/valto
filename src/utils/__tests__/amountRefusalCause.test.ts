import {
    parseAmountInput,
    parseAmountInputResult,
    parseAndNormalizeAmount,
    parseAndNormalizeAmountResult,
} from '../normalizeAmount';

/**
 * Amount refusals name their cause
 *
 * Decimals audit, defect 1. Five different things a user can type all left the
 * parser as the same `null`, so every call site could own only one message, and
 * the message it owned named the one cause that is easiest to describe. A
 * French XOF user typing "12 000,50" - a correctly written amount for their
 * locale, refused only because the currency has no minor unit - was told to
 * enter an amount greater than zero.
 *
 * D6: the result names the cause. The set of accepted and refused amounts does
 * NOT change, which is what the parity block below pins: the old null-returning
 * functions stay the contract, and the new ones only add a reason.
 */

const REFUSED_BY_CAUSE: Record<string, string[]> = {
    empty: ['', '   '],
    notANumber: ['abc', '1,2,3', '12 5', '1,23,456'],
    tooManyDecimals: ['12.555', '0.001'],
};

describe('parseAmountInputResult', () => {
    it('names an empty field', () => {
        for (const input of REFUSED_BY_CAUSE.empty) {
            expect(parseAmountInputResult(input, 'dot', 2)).toEqual({ ok: false, cause: 'empty' });
        }
    });

    it('names input that is not a number', () => {
        for (const input of REFUSED_BY_CAUSE.notANumber) {
            expect(parseAmountInputResult(input, 'dot', 2)).toEqual({ ok: false, cause: 'notANumber' });
        }
    });

    it('names a fraction the currency has no room for', () => {
        for (const input of REFUSED_BY_CAUSE.tooManyDecimals) {
            expect(parseAmountInputResult(input, 'dot', 2)).toEqual({
                ok: false,
                cause: 'tooManyDecimals',
            });
        }
        // The reported case: two decimals on a 0-decimal currency.
        expect(parseAmountInputResult('12000.50', 'dot', 0)).toEqual({
            ok: false,
            cause: 'tooManyDecimals',
        });
    });

    it('returns the typed value with its sign, leaving the zero policy to the caller', () => {
        expect(parseAmountInputResult('15.75', 'dot', 2)).toEqual({ ok: true, value: 15.75 });
        expect(parseAmountInputResult('-5', 'dot', 2)).toEqual({ ok: true, value: -5 });
        expect(parseAmountInputResult('0', 'dot', 2)).toEqual({ ok: true, value: 0 });
    });
});

describe('parseAndNormalizeAmountResult', () => {
    it('separates a negative amount from a zero one', () => {
        expect(parseAndNormalizeAmountResult('-5', 'dot', 2)).toEqual({ ok: false, cause: 'negative' });
        expect(parseAndNormalizeAmountResult('0', 'dot', 2)).toEqual({ ok: false, cause: 'zero' });
        expect(parseAndNormalizeAmountResult('0.00', 'dot', 2)).toEqual({ ok: false, cause: 'zero' });
    });

    it('carries the three parse causes through unchanged', () => {
        expect(parseAndNormalizeAmountResult('', 'dot', 2)).toEqual({ ok: false, cause: 'empty' });
        expect(parseAndNormalizeAmountResult('abc', 'dot', 2)).toEqual({ ok: false, cause: 'notANumber' });
        expect(parseAndNormalizeAmountResult('12000.50', 'dot', 0)).toEqual({
            ok: false,
            cause: 'tooManyDecimals',
        });
    });

    it('returns integer minor units for an accepted amount', () => {
        expect(parseAndNormalizeAmountResult('15.75', 'dot', 2)).toEqual({ ok: true, value: 1575 });
        expect(parseAndNormalizeAmountResult('1000', 'dot', 0)).toEqual({ ok: true, value: 1000 });
        expect(parseAndNormalizeAmountResult('1.5', 'dot', 3)).toEqual({ ok: true, value: 1500 });
    });
});

/**
 * The whole point of D6 is that the message changes and the behaviour does not.
 * Every input is run through both forms at every exponent and profile; an
 * accepted set that shifted by one value would show up here.
 */
describe('the accepted and refused sets are unchanged', () => {
    const INPUTS = [
        '', '   ', 'abc', '1,2,3', '12 5', '1,23,456',
        '0', '-0', '-5', '+5', '0.00', '0,00',
        '15.75', '12.555', '0.001', '12000.50', '1000',
        '2 000,50', '2.000,50', '1,000', '1,234', '1,234.567', '1.5',
    ];
    const PROFILES = ['dot', 'comma', 'space'] as const;
    const EXPONENTS = [0, 2, 3];

    it.each(PROFILES)('parseAmountInput agrees with its result form under %s', (profile) => {
        for (const decimals of EXPONENTS) {
            for (const input of INPUTS) {
                const legacy = parseAmountInput(input, profile, decimals);
                const named = parseAmountInputResult(input, profile, decimals);
                expect(named.ok).toBe(legacy !== null);
                if (named.ok) expect(named.value).toBe(legacy);
            }
        }
    });

    it.each(PROFILES)('parseAndNormalizeAmount agrees with its result form under %s', (profile) => {
        for (const decimals of EXPONENTS) {
            for (const input of INPUTS) {
                const legacy = parseAndNormalizeAmount(input, profile, decimals);
                const named = parseAndNormalizeAmountResult(input, profile, decimals);
                expect(named.ok).toBe(legacy !== null);
                if (named.ok) expect(named.value).toBe(legacy);
            }
        }
    });
});
