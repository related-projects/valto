import * as formatDateModule from '../formatDate';
import { formatDate } from '../formatDate';

/**
 * formatDate - and the month formatter that is not there any more
 *
 * Registry F-06. formatMonthYear called toLocaleDateString('en-US', ...), so
 * the one thing it could never do was follow the app language. It had no
 * callers, which is the only reason it never shipped an English month to a
 * Russian user - a state of affairs one import would have ended.
 *
 * D5 deletes it. The export assertion is the guard: a helper that hard-pins a
 * locale is easier to refuse at the module boundary than to police at every
 * future call site.
 *
 * The formatDate cases build their dates with the local-calendar constructor,
 * as the module's own JSDoc instructs, so nothing here depends on the machine
 * time zone.
 */

describe('formatDate', () => {
    const MARCH_5 = new Date(2026, 2, 5);

    it('honours each supported preference', () => {
        expect(formatDate(MARCH_5, 'DD/MM/YYYY')).toBe('05/03/2026');
        expect(formatDate(MARCH_5, 'MM/DD/YYYY')).toBe('03/05/2026');
        expect(formatDate(MARCH_5, 'YYYY-MM-DD')).toBe('2026-03-05');
    });

    it('falls back to MM/DD/YYYY when no preference is given', () => {
        expect(formatDate(MARCH_5)).toBe('03/05/2026');
    });
});

describe('the formatDate module', () => {
    it('exports no locale-pinned month formatter', () => {
        expect(Object.keys(formatDateModule)).not.toContain('formatMonthYear');
    });
});
