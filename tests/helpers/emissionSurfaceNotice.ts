/**
 * The instruction printed by every guard that pins what this app can send.
 *
 * It is shared rather than duplicated because two guards raise it - the
 * call-site inventory in tests/__tests__/sentryEmissionSurface.test.ts and the
 * init-option key set in app/__tests__/sentryBreadcrumbGuard.test.ts - and a
 * second copy would drift away from the first.
 *
 * The notice names the three artefacts and quotes none of them. That is the
 * whole point: the published policy is the only opposable document and it lives
 * in another repository on purpose, so nothing here can restate it, parse it or
 * assert against it without becoming a second, unversioned copy. What these
 * guards pin is the CODE. Re-reading the text is a human step, and this message
 * is where a machine hands that step back to a person.
 */
export const EMISSION_SURFACE_NOTICE = [
    'The emission surface of this app changed.',
    '',
    'Re-read all three of these before updating the declaration in this file:',
    '',
    '  1. The published privacy policy at github.com/related-projects/valto-legal.',
    '     It is the only opposable document. It is deliberately not mirrored here.',
    '  2. README.md, section Privacy.',
    '  3. The About strings in src/localization/locales/*.json.',
    '',
    'Update the declaration only once all three have been read against what the',
    'code now sends, and corrected at their own source where they no longer match.',
].join('\n');
