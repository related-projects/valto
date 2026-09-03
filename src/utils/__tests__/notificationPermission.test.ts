/**
 * Notification Permission Presentation Rule Tests
 *
 * The blocked-notice decision is a pure function precisely so it can be pinned
 * down here, without a renderer and without the notifications module.
 */

import { shouldShowBlockedNotice } from '../notificationPermission';

describe('shouldShowBlockedNotice', () => {
    it('is shown when the preference is off and the OS holds a denial', () => {
        expect(shouldShowBlockedNotice(false, 'denied')).toBe(true);
    });

    it('is not shown when the permission was never asked for', () => {
        // 'undetermined' is the normal state of a fresh install. Presenting it as
        // "blocked" would tell every new user that something is broken.
        expect(shouldShowBlockedNotice(false, 'undetermined')).toBe(false);
    });

    it('is not shown when the permission is granted', () => {
        expect(shouldShowBlockedNotice(false, 'granted')).toBe(false);
    });

    it('is not shown while the preference is on, whatever the status reads', () => {
        // The invariant guarantees an enabled preference implies a granted
        // permission, so there is nothing to warn about.
        expect(shouldShowBlockedNotice(true, 'granted')).toBe(false);
        expect(shouldShowBlockedNotice(true, 'denied')).toBe(false);
        expect(shouldShowBlockedNotice(true, 'undetermined')).toBe(false);
    });
});
