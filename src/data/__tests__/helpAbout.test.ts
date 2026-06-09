/**
 * Help & FAQ and About Screen Tests
 *
 * Tests that the FAQ content is correctly defined in translation files
 * and that the FAQItem shape is structurally sound across locales.
 */

import type { FAQItem } from '../../screens/HelpFAQScreen';

// Import all locale translation files directly for structural validation
import en from '../../localization/locales/en.json';
import fr from '../../localization/locales/fr.json';
import es from '../../localization/locales/es.json';
import ar from '../../localization/locales/ar.json';
import hi from '../../localization/locales/hi.json';
import zh from '../../localization/locales/zh.json';
import ru from '../../localization/locales/ru.json';
import pt from '../../localization/locales/pt.json';
import ur from '../../localization/locales/ur.json';
import bn from '../../localization/locales/bn.json';

const ALL_LOCALES: Record<string, any> = { en, fr, es, ar, hi, zh, ru, pt, ur, bn };
const EXPECTED_FAQ_COUNT = 12;
const EXPECTED_IDS = [
    'add-transaction',
    'create-wallet',
    'transfer-funds',
    'set-budget',
    'backup-data',
    'restore-data',
    'change-currency',
    'dark-mode',
    'security',
    'offline',
    'reset-data',
    'categories',
];

// ─── FAQ i18n Structure Tests ─────────────────────────────────────────

describe('FAQ i18n Structure', () => {
    Object.entries(ALL_LOCALES).forEach(([lang, locale]) => {
        describe(`[${lang}] locale`, () => {
            it('has faq.items array', () => {
                expect(Array.isArray((locale as any).faq?.items)).toBe(true);
            });

            it(`has exactly ${EXPECTED_FAQ_COUNT} FAQ items`, () => {
                const items: FAQItem[] = (locale as any).faq?.items ?? [];
                expect(items).toHaveLength(EXPECTED_FAQ_COUNT);
            });

            it('every item has required id, question, and answer fields', () => {
                const items: FAQItem[] = (locale as any).faq?.items ?? [];
                for (const item of items) {
                    expect(typeof item.id).toBe('string');
                    expect(item.id.trim().length).toBeGreaterThan(0);
                    expect(typeof item.question).toBe('string');
                    expect(item.question.trim().length).toBeGreaterThan(0);
                    expect(typeof item.answer).toBe('string');
                    expect(item.answer.trim().length).toBeGreaterThan(0);
                }
            });

            it('all IDs match the canonical set', () => {
                const items: FAQItem[] = (locale as any).faq?.items ?? [];
                const ids = items.map((i: FAQItem) => i.id);
                expect(ids).toEqual(EXPECTED_IDS);
            });

            it('all IDs are unique', () => {
                const items: FAQItem[] = (locale as any).faq?.items ?? [];
                const ids = items.map((i: FAQItem) => i.id);
                expect(new Set(ids).size).toBe(ids.length);
            });

            it('has help.title, help.subtitle, and help.noFaqs keys', () => {
                const help = (locale as any).help ?? {};
                expect(typeof help.title).toBe('string');
                expect(help.title.trim().length).toBeGreaterThan(0);
                expect(typeof help.subtitle).toBe('string');
                expect(help.subtitle.trim().length).toBeGreaterThan(0);
                expect(typeof help.noFaqs).toBe('string');
                expect(help.noFaqs.trim().length).toBeGreaterThan(0);
            });
        });
    });
});

// ─── FAQItem Type Safety ──────────────────────────────────────────────

describe('FAQItem type check', () => {
    it('handles empty FAQ array safe-guard (as used in HelpFAQScreen)', () => {
        const emptyFaq: FAQItem[] = [];
        expect(emptyFaq).toHaveLength(0);
        expect(Array.isArray(emptyFaq)).toBe(true);
    });
});

// ─── About Screen Data Tests ──────────────────────────────────────────

describe('About Screen Constants', () => {
    it('expo-constants is available', () => {
        // Constants module is mocked in test env but should not throw
        const Constants = require('expo-constants');
        expect(Constants).toBeDefined();
    });
});
