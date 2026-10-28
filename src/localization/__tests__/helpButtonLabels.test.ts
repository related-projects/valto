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
