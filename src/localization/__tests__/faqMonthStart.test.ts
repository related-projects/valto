/**
 * The Help FAQ explains the month start day (REGISTRE C20, pass 98b item 3)
 *
 * One item, "month-start", right after "How do budgets work?" ("set-budget"),
 * in the five complete bundles: how to make the month start on payday, with
 * the salary example (salary from the 20th to the 8th: choose day 20), citing
 * the Settings row by its title, and saying that the dates of transactions and
 * recurring rules do not change. Partial bundles carry no faq block (pass 83
 * item 7); their users read en.json's list, which then includes the item.
 */

import ar from '../locales/ar.json';
import bn from '../locales/bn.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';
import hi from '../locales/hi.json';
import pt from '../locales/pt.json';
import ru from '../locales/ru.json';
import ur from '../locales/ur.json';
import zh from '../locales/zh.json';

interface CompleteBundle {
    navigation: { settings: string };
    settings: Record<string, unknown>;
    faq: { items: { id: string; question: string; answer: string }[] };
}

const COMPLETE: [string, CompleteBundle][] = [
    ['en', en as unknown as CompleteBundle],
    ['es', es as unknown as CompleteBundle],
    ['fr', fr as unknown as CompleteBundle],
    ['pt', pt as unknown as CompleteBundle],
    ['ru', ru as unknown as CompleteBundle],
];

const PARTIAL: [string, Record<string, unknown>][] = [
    ['ar', ar], ['bn', bn], ['hi', hi], ['ur', ur], ['zh', zh],
];

describe('pass 98b item 3. FAQ entry for the month start day', () => {
    it('pass 98b item 3. "month-start" follows "set-budget" in the 5 complete bundles; partial bundles carry no faq', () => {
        const complete = COMPLETE.map(([code, bundle]) => {
            const ids = bundle.faq.items.map((item) => item.id);
            const at = ids.indexOf('month-start');
            const item = at >= 0 ? bundle.faq.items[at] : undefined;
            const row = `${bundle.navigation.settings} > ${String(bundle.settings.monthStartDay)}`;
            return {
                code,
                followsSetBudget: at > 0 && ids[at - 1] === 'set-budget',
                hasQuestion: (item?.question.trim().length ?? 0) > 0,
                citesTheRow: item?.answer.includes(row) ?? false,
                namesDay20: /(^|\D)20(\D|$)/.test(item?.answer ?? ''),
            };
        });
        const expected = COMPLETE.map(([code]) => ({
            code, followsSetBudget: true, hasQuestion: true, citesTheRow: true, namesDay20: true,
        }));

        expect(complete).toEqual(expected);
        expect(PARTIAL.filter(([, bundle]) => 'faq' in bundle).map(([code]) => code)).toEqual([]);

        const enItem = (en as unknown as CompleteBundle).faq.items.find((item) => item.id === 'month-start');
        expect(enItem?.question).toBe('How do I make my month start on my payday?');
        expect(enItem?.answer).toContain('choose day 20');
        expect(enItem?.answer).toContain('The dates of your transactions and recurring rules do not change');
    });
});
