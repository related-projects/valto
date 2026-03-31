/**
 * Accessibility Utility Tests
 */

import { getA11y, getButtonA11y, getHeaderA11y, getImageA11y, getInputA11y, getLinkA11y } from '../../utils/accessibility';

describe('Accessibility Helpers', () => {
    describe('getButtonA11y', () => {
        it('returns button role and label', () => {
            const result = getButtonA11y('Add transaction');
            expect(result).toEqual({
                accessible: true,
                accessibilityRole: 'button',
                accessibilityLabel: 'Add transaction',
            });
        });

        it('includes hint when provided', () => {
            const result = getButtonA11y('Save', 'Saves the form');
            expect(result.accessibilityHint).toBe('Saves the form');
        });

        it('omits hint when not provided', () => {
            const result = getButtonA11y('Delete');
            expect(result).not.toHaveProperty('accessibilityHint');
        });
    });

    describe('getInputA11y', () => {
        it('returns label without role', () => {
            const result = getInputA11y('Amount');
            expect(result).toEqual({
                accessible: true,
                accessibilityLabel: 'Amount',
            });
        });

        it('includes hint when provided', () => {
            const result = getInputA11y('Amount', 'Enter the transaction amount');
            expect(result.accessibilityHint).toBe('Enter the transaction amount');
        });
    });

    describe('getHeaderA11y', () => {
        it('returns header role and label', () => {
            const result = getHeaderA11y('Dashboard');
            expect(result).toEqual({
                accessible: true,
                accessibilityRole: 'header',
                accessibilityLabel: 'Dashboard',
            });
        });
    });

    describe('getImageA11y', () => {
        it('returns image role and label', () => {
            const result = getImageA11y('App logo');
            expect(result).toEqual({
                accessible: true,
                accessibilityRole: 'image',
                accessibilityLabel: 'App logo',
            });
        });
    });

    describe('getLinkA11y', () => {
        it('returns link role and label', () => {
            const result = getLinkA11y('Terms of service');
            expect(result).toEqual({
                accessible: true,
                accessibilityRole: 'link',
                accessibilityLabel: 'Terms of service',
            });
        });

        it('includes hint when provided', () => {
            const result = getLinkA11y('Privacy', 'Opens privacy policy');
            expect(result.accessibilityHint).toBe('Opens privacy policy');
        });
    });

    describe('getA11y', () => {
        it('returns generic props with role', () => {
            const result = getA11y('Tab content', 'tab');
            expect(result).toEqual({
                accessible: true,
                accessibilityLabel: 'Tab content',
                accessibilityRole: 'tab',
            });
        });

        it('returns generic props without role', () => {
            const result = getA11y('Status text');
            expect(result).toEqual({
                accessible: true,
                accessibilityLabel: 'Status text',
            });
        });

        it('includes all optional props', () => {
            const result = getA11y('Menu', 'menu', 'Opens the navigation menu');
            expect(result.accessibilityRole).toBe('menu');
            expect(result.accessibilityHint).toBe('Opens the navigation menu');
        });
    });
});
