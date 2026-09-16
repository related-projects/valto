/**
 * getOfferedLanguages - the derived set behind the language picker
 *
 * Lives next to the picker's own tests because the picker is its only caller and
 * the two answer one question together: the function decides membership, the
 * component tests prove the list a user actually sees matches it.
 *
 * The rule: the complete locales, plus the active code whatever it is, in
 * SUPPORTED_LANGUAGES declaration order. The active-code clause is what stops an
 * install that already holds an incomplete locale from losing sight of it.
 */

import {
    COMPLETE_LANGUAGE_CODES,
    getOfferedLanguages,
    SUPPORTED_LANGUAGES,
} from '../../../domain/constants/languages';

const codesOf = (active: string): string[] => getOfferedLanguages(active).map(l => l.code);

const completeCodes: readonly string[] = COMPLETE_LANGUAGE_CODES;

/** The complete locales in SUPPORTED_LANGUAGES declaration order. */
const completeInDeclarationOrder = SUPPORTED_LANGUAGES
    .filter(l => completeCodes.includes(l.code))
    .map(l => l.code);

describe('getOfferedLanguages', () => {
    it('offers exactly the complete locales when the active code is one of them', () => {
        expect(codesOf('fr')).toHaveLength(COMPLETE_LANGUAGE_CODES.length);
        expect(codesOf('fr')).toEqual(completeInDeclarationOrder);
    });

    it('adds the active code when it is an incomplete locale', () => {
        const offered = codesOf('ar');

        expect(offered).toHaveLength(COMPLETE_LANGUAGE_CODES.length + 1);
        expect(offered).toContain('ar');
    });

    it('preserves SUPPORTED_LANGUAGES declaration order', () => {
        const offered = codesOf('ar');
        const declarationOrder = SUPPORTED_LANGUAGES
            .filter(l => offered.includes(l.code))
            .map(l => l.code);

        expect(offered).toEqual(declarationOrder);
        // ar is declared between fr and pt. Appending it to the end would still
        // satisfy the length and membership checks above.
        expect(offered.indexOf('ar')).toBeGreaterThan(offered.indexOf('fr'));
        expect(offered.indexOf('ar')).toBeLessThan(offered.indexOf('pt'));
    });

    it('ignores an active code that is not a supported language', () => {
        // A code outside SUPPORTED_LANGUAGES cannot be matched against, so the
        // list falls back to the complete set. It must not throw and must not
        // invent an entry.
        expect(() => getOfferedLanguages('zz')).not.toThrow();
        expect(codesOf('zz')).toHaveLength(COMPLETE_LANGUAGE_CODES.length);
        expect(codesOf('zz')).not.toContain('zz');
    });
});
