/**
 * Help & FAQ and About Screen Tests
 *
 * Tests for the informational screens added to Settings.
 */

import { FAQ_DATA, type FAQItem } from '../../domain/constants/faqData';

// ─── FAQ Data Tests ───────────────────────────────────────────────────

describe('FAQ Data', () => {
    it('contains at least 5 FAQ items', () => {
        expect(FAQ_DATA.length).toBeGreaterThanOrEqual(5);
    });

    it('every item has required fields', () => {
        for (const item of FAQ_DATA) {
            expect(item.id).toBeTruthy();
            expect(typeof item.id).toBe('string');
            expect(item.question).toBeTruthy();
            expect(typeof item.question).toBe('string');
            expect(item.answer).toBeTruthy();
            expect(typeof item.answer).toBe('string');
        }
    });

    it('all IDs are unique', () => {
        const ids = FAQ_DATA.map(item => item.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });

    it('no question is empty after trim', () => {
        for (const item of FAQ_DATA) {
            expect(item.question.trim().length).toBeGreaterThan(0);
        }
    });

    it('no answer is empty after trim', () => {
        for (const item of FAQ_DATA) {
            expect(item.answer.trim().length).toBeGreaterThan(0);
        }
    });

    it('handles empty FAQ array scenario (type check)', () => {
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
