import { NUMBER_FORMATS } from '../../domain/constants/numberFormats';
import { amountPlaceholder } from '../amountPlaceholder';
import { parseAmountInput } from '../normalizeAmount';

/**
 * amountPlaceholder - the hint in an empty amount field
 *
 * Registry F-06, findings 3, 19 and 21-24. Six amount inputs carried the ASCII
 * literal "0.00". On XOF - 0 decimals, and the currency of a francophone region
 * whose number-format profile is `space` - the field advertised a shape the
 * parser then refused, with a message about zero.
 *
 * D3: the placeholder is derived, not translated. It is the currency's exponent
 * and the user's decimal character, both of which the app already holds.
 *
 * The expected separator is read from NUMBER_FORMATS rather than restated, for
 * the same reason normalizeAmount reads it: the placeholder and the parser must
 * not be able to drift apart.
 */

const decimalOf = (profile: 'dot' | 'comma' | 'space') => NUMBER_FORMATS[profile].decimal;

describe('amountPlaceholder', () => {
    it('shows no fraction at all for a 0-decimal currency', () => {
        expect(amountPlaceholder(0, 'dot')).toBe('0');
        expect(amountPlaceholder(0, 'comma')).toBe('0');
        expect(amountPlaceholder(0, 'space')).toBe('0');
    });

    it('shows two fraction digits for a 2-decimal currency', () => {
        expect(amountPlaceholder(2, 'dot')).toBe(`0${decimalOf('dot')}00`);
        expect(amountPlaceholder(2, 'comma')).toBe(`0${decimalOf('comma')}00`);
        expect(amountPlaceholder(2, 'space')).toBe(`0${decimalOf('space')}00`);
    });

    it('shows three fraction digits for a 3-decimal currency', () => {
        expect(amountPlaceholder(3, 'dot')).toBe(`0${decimalOf('dot')}000`);
        expect(amountPlaceholder(3, 'comma')).toBe(`0${decimalOf('comma')}000`);
        expect(amountPlaceholder(3, 'space')).toBe(`0${decimalOf('space')}000`);
    });

    it('uses the dot profile and two decimals when nothing is passed', () => {
        expect(amountPlaceholder()).toBe('0.00');
    });

    /**
     * The placeholder is a promise about what the field accepts. A shape the
     * parser refuses would repeat the defect in a new place.
     */
    it('produces a string the parser accepts at the same exponent and profile', () => {
        const profiles = ['dot', 'comma', 'space'] as const;

        for (const profile of profiles) {
            for (const decimals of [0, 2, 3]) {
                const hint = amountPlaceholder(decimals, profile);
                expect(parseAmountInput(hint, profile, decimals)).toBe(0);
            }
        }
    });
});
