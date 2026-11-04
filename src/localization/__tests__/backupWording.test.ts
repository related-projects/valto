/**
 * The Reset confirmation and the Help backup answer tell the truth about
 * backup files (pass 82, Owner decision 4)
 *
 *  - storeRecovery.confirmBody said "There is no backup or server copy, so this
 *    cannot be undone". A Valto backup file made earlier restores after the
 *    reset like on any other day; the confirmation now says so, and keeps
 *    saying that what is not in such a file is gone.
 *  - faq.items "backup-data" suggested saving the backup file to cloud storage
 *    without saying it is plain JSON (backupService.ts:423, :434). It now says
 *    the file is not encrypted, and that Valto data does not follow the user to
 *    a new phone without it: the app-owned backup rules keep the databases and
 *    files out of Android backups and phone transfers (Owner decision 1).
 *
 * Read from the bundles the user is shown, in en and fr. Non-ASCII phrases are
 * written as \u escapes.
 */

import en from '../locales/en.json';
import fr from '../locales/fr.json';

interface FaqItem {
    id: string;
    answer: string;
}

const backupAnswer = (bundle: { faq: { items: FaqItem[] } }): string => {
    const item = bundle.faq.items.find((candidate) => candidate.id === 'backup-data');
    if (!item) {
        throw new Error('faq.items has no "backup-data" entry');
    }
    return item.answer;
};

describe('pass 82 d. the Reset confirmation', () => {
    it('pass 82 d (en): says a Valto backup file can be restored afterwards', () => {
        const body = en.storeRecovery.confirmBody;

        expect(body).toContain('Valto backup file');
        expect(body).toContain('restore it afterwards');
        expect(body).not.toContain('There is no backup');
    });

    it('pass 82 d (fr): says a Valto backup file can be restored afterwards', () => {
        const body = fr.storeRecovery.confirmBody;

        expect(body).toContain('fichier de sauvegarde Valto');
        expect(body).toContain('restaurer ensuite');
        expect(body).not.toContain('aucune sauvegarde');
    });
});

describe('pass 82 d. the Help backup answer', () => {
    it('pass 82 d (en): says the file is not encrypted and data does not follow a phone change without it', () => {
        const answer = backupAnswer(en);

        expect(answer).toContain('not encrypted');
        expect(answer).toContain('new phone without this file');
    });

    it('pass 82 d (fr): says the file is not encrypted and data does not follow a phone change without it', () => {
        const answer = backupAnswer(fr);

        expect(answer).toContain('n\'est pas chiffr\u00e9');
        expect(answer).toContain('Sans ce fichier');
        expect(answer).toContain('nouveau t\u00e9l\u00e9phone');
    });
});
