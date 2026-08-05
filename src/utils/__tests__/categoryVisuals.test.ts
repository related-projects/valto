/**
 * categoryVisuals Utility Tests
 *
 * The stored icon/color must always win over the legacy name-based guess, so a
 * category renamed into any language keeps its appearance. The name ladder is a
 * fallback for legacy rows that carry no icon/color.
 */

import { DEFAULT_CATEGORY_ICON, resolveCategoryVisual } from '../categoryVisuals';

const FALLBACK = '#ACCE55';

describe('resolveCategoryVisual', () => {
    // ─── Stored values win ─────────────────────────────────────────────

    it('uses the stored icon and color', () => {
        expect(resolveCategoryVisual({ name: 'Nourriture', icon: 'restaurant', color: '#FFB74D' }, FALLBACK))
            .toEqual({ icon: 'restaurant-outline', color: '#FFB74D' });
    });

    it('resolves the seeded French categories', () => {
        expect(resolveCategoryVisual({ name: 'Transport', icon: 'car', color: '#64B5F6' }, FALLBACK))
            .toEqual({ icon: 'car-outline', color: '#64B5F6' });
        expect(resolveCategoryVisual({ name: 'Salaire', icon: 'cash', color: '#66BB6A' }, FALLBACK))
            .toEqual({ icon: 'cash-outline', color: '#66BB6A' });
    });

    it('keeps stored values for a name the ladder would otherwise match', () => {
        // A user renaming "Transport" must not be dragged back to the ladder's blue car.
        expect(resolveCategoryVisual({ name: 'Transport', icon: 'rocket', color: '#000000' }, FALLBACK))
            .toEqual({ icon: 'rocket-outline', color: '#000000' });
    });

    it('returns a glyph with no outline variant verbatim', () => {
        // Ionicons ships no `logo-*-outline` glyphs.
        expect(resolveCategoryVisual({ name: 'Autre', icon: 'logo-bitcoin' }, FALLBACK).icon)
            .toBe('logo-bitcoin');
    });

    it('accepts a stored icon that is already an outline glyph', () => {
        expect(resolveCategoryVisual({ name: 'Autre', icon: 'pricetag-outline' }, FALLBACK).icon)
            .toBe('pricetag-outline');
    });

    // ─── Legacy name fallback ──────────────────────────────────────────

    it('falls back to the name ladder when no icon or color is stored', () => {
        expect(resolveCategoryVisual({ name: 'Food & Dining' }, FALLBACK))
            .toEqual({ icon: 'restaurant-outline', color: '#F59E0B' });
        expect(resolveCategoryVisual({ name: 'Salary' }, FALLBACK))
            .toEqual({ icon: 'cash-outline', color: '#4ade80' });
    });

    it('is case-insensitive in the fallback ladder', () => {
        expect(resolveCategoryVisual({ name: 'SHOPPING' }, FALLBACK))
            .toEqual({ icon: 'cart-outline', color: '#8B5CF6' });
    });

    it('mixes a stored color with a ladder icon', () => {
        expect(resolveCategoryVisual({ name: 'Transport', color: '#123456' }, FALLBACK))
            .toEqual({ icon: 'car-outline', color: '#123456' });
    });

    // ─── Defaults ──────────────────────────────────────────────────────

    it('falls back to the default icon and the passed color for an unknown name', () => {
        expect(resolveCategoryVisual({ name: 'Nourriture' }, FALLBACK))
            .toEqual({ icon: DEFAULT_CATEGORY_ICON, color: FALLBACK });
    });

    it('falls back to the default icon and the passed color when unresolved', () => {
        expect(resolveCategoryVisual(undefined, FALLBACK))
            .toEqual({ icon: DEFAULT_CATEGORY_ICON, color: FALLBACK });
    });

    it('ignores an unknown stored glyph and uses the ladder', () => {
        expect(resolveCategoryVisual({ name: 'Transport', icon: 'not-a-real-glyph' }, FALLBACK).icon)
            .toBe('car-outline');
    });
});
