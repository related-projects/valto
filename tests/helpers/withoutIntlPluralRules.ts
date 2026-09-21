/**
 * Removes Intl.PluralRules from the test realm, on import.
 *
 * V-43: Hermes ships an Intl object without the PluralRules constructor. i18next
 * does not fail loudly in that state - PluralResolver.getRule catches the throw,
 * skips its "No Intl support" log because `typeof Intl` is still "object", and
 * returns a two-category dummy rule for every language (audit V-70, Q2.3). So a
 * plural scheme that works in jest can be silently wrong on a device, and the
 * only honest way to test one is to take the constructor away first.
 *
 * Import this as the FIRST import of a test file, before src/localization/i18n:
 * i18n.init runs at import time, and the condition has to be in force by then.
 *
 * Nothing is restored afterwards, and nothing needs to be: jest builds a fresh
 * environment per test file, so the deletion cannot reach another suite. The
 * three-zone full run is what would surface it if that ever stopped being true.
 */

const intl = Intl as { PluralRules?: unknown };

delete intl.PluralRules;

export {};
