/**
 * Two French strings (pass 101b items 6 and 7; REGISTRE decision d of 24/11)
 *
 * Item 6. The incoming transfer leg shows its stored English prefix
 * translated at display time (REGISTRE C38, decision 1, option A): the
 * prefix value, a space, then the wallet name as stored. The French value
 * "Transfert de" put "de" before the wallet name whatever it was, so a name
 * starting with a vowel or a mute h read without the elision French requires
 * ("de" + "Epargne"). The value is now one that needs no elision. The value
 * keeps the same shape: no placeholder, the wallet name is appended by
 * displayTransactionNote.
 *
 * Item 7. common.reloadApp (the error screen button) was still the English
 * text in fr.json. Every other complete locale already translated it.
 *
 * Non-English expected strings are read from the locale files, never written
 * here.
 */

import { TRANSFER_IN_CATEGORY_ID } from '../../domain/ledger/transferCategories';
import { TransactionType } from '../../domain/entities';
import { displayTransactionNote } from '../../utils/transferNote';
import i18n from '../i18n';
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import pt from '../locales/pt.json';
import ru from '../locales/ru.json';

const tFr = i18n.getFixedT('fr');

describe('pass 101b item 6. fr incoming transfer prefix', () => {
    it.each(['Epargne', 'Assurance', 'Habitat'])('pass 101b item 6: the incoming leg from "%s" reads without a missing elision', (wallet) => {
        const shown = displayTransactionNote(
            { type: TransactionType.TRANSFER, categoryId: TRANSFER_IN_CATEGORY_ID, note: `Transfer from ${wallet}` },
            tFr,
        );

        // "de" directly before a word that starts with a vowel or h needs elision.
        expect(shown).not.toMatch(/\bde [aeiouyh]/i);
        // Same shape as before: the prefix value, one space, the wallet name.
        expect(shown).toBe(`${fr.transactions.transferNote.from} ${wallet}`);
        expect(fr.transactions.transferNote.from).not.toContain('{{');
    });
});

describe('pass 101b item 7. common.reloadApp is translated', () => {
    it.each([
        ['es', es],
        ['fr', fr],
        ['pt', pt],
        ['ru', ru],
    ])('pass 101b item 7 (%s): common.reloadApp is not the English text', (_locale, bundle) => {
        expect(bundle.common.reloadApp).not.toBe(en.common.reloadApp);
        expect(bundle.common.reloadApp.trim().length).toBeGreaterThan(0);
    });
});
