/**
 * Recurring messages name the real trigger, in every complete locale (pass 80)
 *
 * The engine records recurring debits at an app start, on a rule create, on a
 * restore, and in the edit and pause catch-ups (V-100). Nothing runs when a
 * wallet is topped up, when a due date arrives, or when the app comes back
 * from the background. Messages said otherwise:
 *  - recurring.ruleCreatedInsufficientMessage: "generated automatically once
 *    funds are available" (finding 1; Owner decision, pass 80: recorded at the
 *    next app start if funds are then sufficient);
 *  - alerts.restoreSuccessRulesFailedMessage: "the next time you open the app"
 *    (finding 2);
 *  - recurring.ruleCreatedNoTransactions: "generated on the next due date";
 *  - recurring.ruleCreatedLaunch, es and pt only: "when you open the app".
 *
 * Each case reads the bundle the user is shown, in en, fr, es, pt and ru. The
 * screen and hook suites check the alert itself in en and fr:
 * RecurringRulesScreen.triggerWording.test.tsx and
 * useSettingsRestore.triggerWording.test.ts.
 *
 * Non-ASCII phrases are written as \u escapes.
 */

import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import pt from '../locales/pt.json';
import ru from '../locales/ru.json';

type Locale = 'en' | 'fr' | 'es' | 'pt' | 'ru';

const BUNDLES: Record<Locale, unknown> = { en, fr, es, pt, ru };

/** How each locale names the next app start, as the pass 79 messages word it. */
const APP_START: Record<Locale, string> = {
    en: 'the app starts',
    fr: 'd\u00e9marrage de l\'application',
    es: 'se inicie la app',
    pt: 'o app iniciar',
    ru: '\u0437\u0430\u043f\u0443\u0441\u043a\u0435 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u044f',
};

/** The triggers that do not exist: automatic, once funds arrive, on opening, on the due date. */
const FALSE_TRIGGERS: Record<Locale, string[]> = {
    en: ['automatically', 'once funds', 'open the app', 'on the next due date'],
    fr: ['automatiquement', 'lorsque les fonds', 'ouverture', '\u00e0 la prochaine \u00e9ch\u00e9ance'],
    es: ['autom\u00e1ticamente', 'cuando haya fondos', 'abras', 'abrir la app', 'en la pr\u00f3xima fecha'],
    pt: ['automaticamente', 'assim que houver', 'abrir o app', 'abertura', 'na pr\u00f3xima data'],
    ru: [
        '\u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438',
        '\u043a\u0430\u043a \u0442\u043e\u043b\u044c\u043a\u043e',
        '\u0432 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0443\u044e \u0434\u0430\u0442\u0443',
    ],
};

function message(locale: Locale, key: string): string {
    let node: unknown = BUNDLES[locale];
    for (const part of key.split('.')) {
        node = (node as Record<string, unknown>)[part];
    }
    if (typeof node !== 'string') throw new Error(`${locale}: no message at ${key}`);
    return node;
}

function expectNoFalseTrigger(locale: Locale, key: string): void {
    const text = message(locale, key);
    for (const phrase of FALSE_TRIGGERS[locale]) {
        expect(text).not.toContain(phrase);
    }
}

function expectNamesAppStart(locale: Locale, key: string): void {
    expectNoFalseTrigger(locale, key);
    expect(message(locale, key)).toContain(APP_START[locale]);
}

describe('pass 80: recurring messages name the next app start', () => {
    it.each<Locale>(['en', 'fr', 'es', 'pt', 'ru'])(
        'finding 1. %s: ruleCreatedInsufficientMessage no longer promises generation once funds are available',
        (locale) => {
            expectNamesAppStart(locale, 'recurring.ruleCreatedInsufficientMessage');
        },
    );

    it.each<Locale>(['en', 'fr', 'es', 'pt'])(
        'finding 2. %s: restoreSuccessRulesFailedMessage names the next app start, not the next opening',
        (locale) => {
            expectNamesAppStart(locale, 'alerts.restoreSuccessRulesFailedMessage');
        },
    );

    it.each<Locale>(['en', 'fr', 'es', 'pt', 'ru'])(
        '%s: ruleCreatedNoTransactions no longer promises generation on the due date itself',
        (locale) => {
            expectNamesAppStart(locale, 'recurring.ruleCreatedNoTransactions');
        },
    );

    it.each<Locale>(['es', 'pt'])(
        '%s: ruleCreatedLaunch names the next app start, not the next opening',
        (locale) => {
            expectNamesAppStart(locale, 'recurring.ruleCreatedLaunch');
        },
    );
});

describe('pass 80 controls: messages that already named the real trigger', () => {
    it('control: ru restoreSuccessRulesFailedMessage already names the next app start', () => {
        expectNamesAppStart('ru', 'alerts.restoreSuccessRulesFailedMessage');
    });

    it.each<Locale>(['en', 'fr', 'ru'])(
        'control: %s ruleCreatedLaunch names the next launch and no false trigger',
        (locale) => {
            expectNoFalseTrigger(locale, 'recurring.ruleCreatedLaunch');
        },
    );

    it.each<Locale>(['en', 'fr', 'es', 'pt', 'ru'])(
        'control: %s restoreRulesFailedNote already names the next app start',
        (locale) => {
            expectNamesAppStart(locale, 'alerts.restoreRulesFailedNote');
        },
    );
});
