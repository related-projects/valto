import { CAP_MINOR } from '../../../tests/helpers/amountCapCases';
import i18n from '../../localization/i18n';
import { amountRefusalMessage } from '../amountRefusalMessage';
import {
    parseAmountInput,
    parseAmountInputResult,
    parseAndNormalizeAmount,
    parseAndNormalizeAmountResult,
} from '../normalizeAmount';

/**
 * V-128: an entered amount above 999 999 999 999 minor units is refused
 *
 * Pass 87 audit. No amount field had an upper bound, so 123456789123456789 XOF
 * went through the parser and was stored as ...784: the number is past
 * Number.MAX_SAFE_INTEGER and cannot be held exactly. The owner capped every
 * entered amount at 999 999 999 999 minor units (decision 1, 04/11).
 *
 * The shared parse path is where every amount field reads its input, so the
 * refusal is a cause of its own there, `tooLarge`, and the sentence names the
 * maximum in the user's currency.
 *
 * The tests named "control" pass on the code before the fix: the cap itself
 * was accepted and stays accepted, exactly.
 */

const TOO_LARGE = { ok: false, cause: 'tooLarge' };

/** Exponent, then the cap and the cap plus one minor unit as typed under `dot`. */
const BY_EXPONENT: [number, string, string][] = [
    [0, '999999999999', '1000000000000'],
    [2, '9999999999.99', '10000000000.00'],
    [3, '999999999.999', '1000000000.000'],
];

describe('V-128 the parser refuses an amount above the cap', () => {
    it.each(BY_EXPONENT)('V-128 a. %i decimals: the cap plus one minor unit is tooLarge', (decimals, _cap, over) => {
        expect(parseAndNormalizeAmountResult(over, 'dot', decimals)).toEqual(TOO_LARGE);
        expect(parseAmountInputResult(over, 'dot', decimals)).toEqual(TOO_LARGE);
        expect(parseAndNormalizeAmount(over, 'dot', decimals)).toBeNull();
        expect(parseAmountInput(over, 'dot', decimals)).toBeNull();
    });

    it('V-128 b. the reported amount, 123456789123456789 XOF, is tooLarge', () => {
        expect(parseAndNormalizeAmountResult('123456789123456789', 'space', 0)).toEqual(TOO_LARGE);
        expect(parseAndNormalizeAmountResult('123 456 789 123 456 789', 'space', 0)).toEqual(TOO_LARGE);
    });

    it('V-128 c. a number too long to be finite is tooLarge, not notANumber', () => {
        const digits = '9'.repeat(400);
        expect(parseAndNormalizeAmountResult(digits, 'dot', 2)).toEqual(TOO_LARGE);
        expect(parseAmountInputResult(digits, 'dot', 0)).toEqual(TOO_LARGE);
    });

    it('V-128 d. a negative amount past the cap is tooLarge where the sign is left to the caller', () => {
        expect(parseAmountInputResult('-1000000000000', 'dot', 0)).toEqual(TOO_LARGE);
        expect(parseAmountInputResult('-10000000000.00', 'dot', 2)).toEqual(TOO_LARGE);
    });
});

describe('V-128 control: the cap itself is accepted exactly', () => {
    it.each(BY_EXPONENT)('control: %i decimals, the cap converts to exactly 999999999999', (decimals, cap) => {
        expect(parseAndNormalizeAmountResult(cap, 'dot', decimals)).toEqual({ ok: true, value: CAP_MINOR });
        expect(parseAndNormalizeAmount(cap, 'dot', decimals)).toBe(CAP_MINOR);
    });

    it('control: the cap as the formatters group it reads back exactly', () => {
        expect(parseAndNormalizeAmountResult('999 999 999 999', 'space', 0)).toEqual({ ok: true, value: CAP_MINOR });
        expect(parseAndNormalizeAmountResult('9,999,999,999.99', 'dot', 2)).toEqual({ ok: true, value: CAP_MINOR });
        expect(parseAndNormalizeAmountResult('9.999.999.999,99', 'comma', 2)).toEqual({ ok: true, value: CAP_MINOR });
    });
});

describe('V-128 the refusal names the maximum in the user\'s currency', () => {
    const KEY = 'common.amountErrors.tooLarge';
    const MAX = '<max>';

    it.each(['en', 'es', 'fr', 'pt', 'ru'])('V-128 e. %s carries its own sentence, with the maximum in it', (lng) => {
        const fixed = i18n.getFixedT(lng);

        expect(i18n.exists(KEY, { lng, fallbackLng: false })).toBe(true);
        const message = amountRefusalMessage('tooLarge', fixed, 'modals.addTransaction.invalidAmountMessage', '0', MAX);
        expect(message).toBe(fixed(KEY, { max: MAX }));
        expect(message).toContain(MAX);
    });
});
