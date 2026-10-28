/**
 * Help answers name the buttons they send the user to as the screens label
 * them (pass 83b, item 3)
 *
 * The first four Help answers tell the user which button to tap, and quote its
 * name. The quotes did not match the screens: "Add Expense" and "Add Income"
 * for Quick Actions buttons labelled "Expense" and "Income", "Add Wallet" for a
 * button labelled "Add", "Create Budget" for one labelled "Create a budget", and
 * the same in every complete locale; ru also quoted the budget card under a
 * title the card does not show. The text follows the screen, never the
 * reverse.
 *
 * For each answer, BUTTONS lists the buttons it names, in order, by the key
 * their label is rendered from. TITLES are the other on-screen names these
 * answers may quote: the tabs, cards and sections the buttons sit in. In every
 * locale, each quoted name in these answers must be either the current value
 * of a TITLES key or, in order, the current value of the answer's BUTTONS keys.
 * Values are read from each bundle; nothing here is a translation.
 *
 * Pass 84 item 3: the names these answers give WITHOUT quotes - the tab the
 * buttons are on, the card or section they sit in - did not match the screen
 * either: "the dashboard" (and its equivalents) for a tab labelled by
 * navigation.dashboard, "the Budget section" for a card titled by
 * components.budgetProgress.title, and pt quoting the Quick Actions title with
 * a capital the screen does not show. NAMES lists, per answer, the keys of the
 * names it gives; each must appear as the bundle spells it, and every
 * occurrence of it, ignoring case, must be spelled that way.
 *
 * Pass 84b item 6: the ru transfer answer cited the Quick Actions section in an
 * inflected, unquoted form, the one form pass 84 let through. It now names the
 * section by its exact title, quoted, like the ru budget answer does; no
 * inflected form is left, so the pass 84 check applies to ru unchanged.
 */

import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import pt from '../locales/pt.json';
import ru from '../locales/ru.json';

type NestedRecord = { [key: string]: unknown };

interface Bundle extends NestedRecord {
    faq: { items: { id: string; answer: string }[] };
}

/** Keys whose values label the buttons each answer names, in order. */
const BUTTONS: Record<string, string[]> = {
    // src/components/dashboard/QuickActions.tsx:32 and :25, rendered at :85.
    'add-transaction': ['components.quickActions.expense', 'components.quickActions.income'],
    // src/screens/WalletsScreen.tsx:225, the header button (always shown).
    'create-wallet': ['wallets.add'],
    // src/components/dashboard/QuickActions.tsx:39, rendered at :85.
    'transfer-funds': ['components.quickActions.transfer'],
    // src/components/dashboard/BudgetProgress.tsx:88, the card with no budget yet.
    'set-budget': ['components.budgetProgress.createBudget'],
};

/** Keys whose values name the tabs, cards and sections those buttons sit in. */
const TITLES = [
    'navigation.dashboard', // app/(tabs)/_layout.tsx:23
    'dashboard.title', // src/screens/DashboardScreen.tsx:190
    'navigation.wallets', // app/(tabs)/_layout.tsx:37
    'wallets.title', // src/screens/WalletsScreen.tsx:206
    'components.quickActions.title', // src/components/dashboard/QuickActions.tsx:49
    'components.budgetProgress.title', // src/components/dashboard/BudgetProgress.tsx:57 and :126
];

/** Quoted names: "..." in en, U+00AB ... U+00BB elsewhere (fr with spaces inside). */
const QUOTED: Record<string, RegExp> = {
    en: /"([^"]+)"/g,
    pt: /\u00ab\s*([^\u00bb]*?)\s*\u00bb/g,
    ru: /\u00ab\s*([^\u00bb]*?)\s*\u00bb/g,
    es: /\u00ab\s*([^\u00bb]*?)\s*\u00bb/g,
    fr: /\u00ab\s*([^\u00bb]*?)\s*\u00bb/g,
};

const BUNDLES: [string, Bundle][] = [
    ['en', en as unknown as Bundle],
    ['pt', pt as unknown as Bundle],
    ['ru', ru as unknown as Bundle],
    ['es', es as unknown as Bundle],
    ['fr', fr as unknown as Bundle],
];

const valueAt = (obj: NestedRecord, path: string): unknown =>
    path.split('.').reduce<unknown>(
        (current, part) => (typeof current === 'object' && current !== null ? (current as NestedRecord)[part] : undefined),
        obj
    );

const labelOf = (bundle: Bundle, locale: string, key: string): string => {
    const value = valueAt(bundle, key);
    if (typeof value !== 'string') {
        throw new Error(`${locale}.json has no string at ${key}`);
    }
    return value;
};

describe('pass 83b item 3. buttons named by the Help answers', () => {
    it.each(BUNDLES)('pass 83b item 3 (%s): every quoted name is a label the screen renders', (locale, bundle) => {
        const titles = TITLES.map((key) => labelOf(bundle, locale, key));

        const problems: string[] = [];
        for (const [id, keys] of Object.entries(BUTTONS)) {
            const item = bundle.faq.items.find((candidate) => candidate.id === id);
            if (!item) {
                throw new Error(`${locale}.json faq.items has no "${id}" entry`);
            }
            const quoted = [...item.answer.matchAll(QUOTED[locale])].map((match) => match[1]);
            const named = quoted.filter((name) => !titles.includes(name));
            const labels = keys.map((key) => labelOf(bundle, locale, key));

            if (JSON.stringify(named) !== JSON.stringify(labels)) {
                problems.push(`${id}: quotes ${JSON.stringify(named)}, the screen labels ${JSON.stringify(labels)}`);
            }
        }

        expect(problems).toEqual([]);
    });
});

/** Keys whose values name, without quotes, the tab and the card or section each answer sends the user to. */
const NAMES: Record<string, string[]> = {
    // src/components/dashboard/QuickActions.tsx:49; app/(tabs)/_layout.tsx:23.
    'add-transaction': ['components.quickActions.title', 'navigation.dashboard'],
    // app/(tabs)/_layout.tsx:23; src/components/dashboard/QuickActions.tsx:49.
    'transfer-funds': ['navigation.dashboard', 'components.quickActions.title'],
    // app/(tabs)/_layout.tsx:23; src/components/dashboard/BudgetProgress.tsx:126.
    'set-budget': ['navigation.dashboard', 'components.budgetProgress.title'],
};

/** How `text` spells each occurrence of `name`, found ignoring case. */
const spellingsOf = (text: string, name: string): string[] => {
    const lowerText = text.toLowerCase();
    const lowerName = name.toLowerCase();
    const found: string[] = [];
    for (let at = lowerText.indexOf(lowerName); at !== -1; at = lowerText.indexOf(lowerName, at + 1)) {
        found.push(text.slice(at, at + name.length));
    }
    return found;
};

describe('pass 84 item 3. names the Help answers give without quotes', () => {
    it.each(BUNDLES)('pass 84 item 3 (%s): every tab and section is named as the screen labels it', (locale, bundle) => {
        const problems: string[] = [];
        for (const [id, keys] of Object.entries(NAMES)) {
            const item = bundle.faq.items.find((candidate) => candidate.id === id);
            if (!item) {
                throw new Error(`${locale}.json faq.items has no "${id}" entry`);
            }
            for (const key of keys) {
                const name = labelOf(bundle, locale, key);
                const spellings = spellingsOf(item.answer, name);
                if (!spellings.includes(name)) {
                    problems.push(`${id}: does not name ${key} as "${name}"`);
                }
                const wrong = spellings.filter((spelling) => spelling !== name);
                if (wrong.length > 0) {
                    problems.push(`${id}: spells ${key} ${JSON.stringify(wrong)}, the screen labels it "${name}"`);
                }
            }
        }

        expect(problems).toEqual([]);
    });
});

describe('pass 84b item 6. the ru transfer answer cites Quick Actions by its title', () => {
    it('pass 84b item 6 (ru): transfer-funds quotes the Quick Actions title exactly', () => {
        const bundle = ru as unknown as Bundle;
        const title = labelOf(bundle, 'ru', 'components.quickActions.title');
        const item = bundle.faq.items.find((candidate) => candidate.id === 'transfer-funds');
        if (!item) {
            throw new Error('ru.json faq.items has no "transfer-funds" entry');
        }

        // U+00AB and U+00BB: the quotes ru uses for every on-screen name.
        expect(item.answer).toContain(`\u00ab${title}\u00bb`);
    });
});
