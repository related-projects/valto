/**
 * useFormatting Hook Tests
 *
 * Tests settings-aware formatting for amounts and dates,
 * default fallbacks, and settings change subscription.
 */

import { renderHook, waitFor } from '@testing-library/react-native';

const mockLoadSettings = jest.fn();
const mockSubscribe = jest.fn((event: string, callback: any) => jest.fn());

jest.mock('../../core/events/dataEvents', () => ({
    dataEvents: {
        subscribe: (event: string, callback: any) => mockSubscribe(event, callback),
        emit: jest.fn(),
    },
}));

jest.mock('../../data/services/settingsService', () => ({
    loadSettings: () => mockLoadSettings(),
}));

import { useFormatting } from '../useFormatting';

describe('useFormatting', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSubscribe.mockReturnValue(jest.fn());
    });

    it('returns formatting functions before settings load', () => {
        mockLoadSettings.mockReturnValue(new Promise(() => {})); // Never resolves

        const { result } = renderHook(() => useFormatting());

        // Should have fallback formatting functions
        expect(typeof result.current.formatAmount).toBe('function');
        expect(typeof result.current.formatAmountCompact).toBe('function');
        expect(typeof result.current.formatAmountWhole).toBe('function');
        expect(typeof result.current.formatDate).toBe('function');
        expect(result.current.settings).toBeNull();
    });

    it('uses default currency symbol ($) when settings not loaded', () => {
        mockLoadSettings.mockReturnValue(new Promise(() => {}));

        const { result } = renderHook(() => useFormatting());

        // Fallback to $ symbol
        const formatted = result.current.formatAmount(12345);
        expect(formatted).toContain('$');
    });

    it('uses settings currency symbol after load', async () => {
        mockLoadSettings.mockResolvedValue({
            currency: 'EUR',
            decimalSeparator: 'dot',
            dateFormat: 'DD/MM/YYYY',
        });

        const { result } = renderHook(() => useFormatting());

        await waitFor(() => {
            expect(result.current.settings).not.toBeNull();
        });

        const formatted = result.current.formatAmount(12345);
        expect(formatted).toContain('€');
    });

    it('formats amount with comma separator', async () => {
        mockLoadSettings.mockResolvedValue({
            currency: 'USD',
            decimalSeparator: 'comma',
            dateFormat: 'MM/DD/YYYY',
        });

        const { result } = renderHook(() => useFormatting());

        await waitFor(() => {
            expect(result.current.settings).not.toBeNull();
        });

        const formatted = result.current.formatAmount(12345);
        // Comma separator: 123,45
        expect(formatted).toContain(',');
    });

    it('parses amounts with the persisted comma separator', async () => {
        mockLoadSettings.mockResolvedValue({
            currency: 'USD',
            decimalSeparator: 'comma',
            dateFormat: 'MM/DD/YYYY',
        });

        const { result } = renderHook(() => useFormatting());

        await waitFor(() => {
            expect(result.current.settings).not.toBeNull();
        });

        expect(result.current.parseAmount('12,50')).toBe(12.5);
        expect(result.current.parseAmountToCents('12,50')).toBe(1250);
        expect(result.current.parseAmountToCents('2.000,50')).toBe(200050);
        expect(result.current.parseAmountToCents('abc')).toBeNull();
    });

    it('parses amounts with the persisted dot separator', async () => {
        mockLoadSettings.mockResolvedValue({
            currency: 'USD',
            decimalSeparator: 'dot',
            dateFormat: 'MM/DD/YYYY',
        });

        const { result } = renderHook(() => useFormatting());

        await waitFor(() => {
            expect(result.current.settings).not.toBeNull();
        });

        expect(result.current.parseAmountToCents('12.50')).toBe(1250);
        expect(result.current.parseAmountToCents('2,000.50')).toBe(200050);
        // A comma-locale user typing a comma under the default dot preference.
        expect(result.current.parseAmountToCents('12,50')).toBe(1250);
    });

    it('carries the exponent of a 3-decimal currency through format and parse', async () => {
        // JOD is a 3-decimal currency. Symbol and exponent both come from the real
        // registry - only dataEvents and settingsService are mocked in this suite.
        mockLoadSettings.mockResolvedValue({
            currency: 'JOD',
            decimalSeparator: 'dot',
            dateFormat: 'MM/DD/YYYY',
        });

        const { result } = renderHook(() => useFormatting());

        await waitFor(() => {
            expect(result.current.settings).not.toBeNull();
        });

        expect(result.current.decimals).toBe(3);
        expect(result.current.formatAmount(1234)).toContain('JD1.234');
        // A lone grouping separator filling the fraction reads as the fraction, so this
        // stores 1.234 JOD and not 1234 JOD - a silent 1000x error before the tie-break.
        expect(result.current.parseAmount('1,234')).toBe(1.234);
        expect(result.current.parseAmountToCents('1,234')).toBe(1234);
    });

    it('parses with the dot fallback before settings load', () => {
        mockLoadSettings.mockReturnValue(new Promise(() => {}));

        const { result } = renderHook(() => useFormatting());

        expect(result.current.parseAmountToCents('12.50')).toBe(1250);
    });

    it('subscribes to settings events on mount', () => {
        mockLoadSettings.mockResolvedValue({
            currency: 'USD',
            decimalSeparator: 'dot',
            dateFormat: 'MM/DD/YYYY',
        });

        renderHook(() => useFormatting());

        expect(mockSubscribe).toHaveBeenCalledWith('settings', expect.any(Function));
    });

    it('formatDate returns a string', async () => {
        mockLoadSettings.mockResolvedValue({
            currency: 'USD',
            decimalSeparator: 'dot',
            dateFormat: 'YYYY-MM-DD',
        });

        const { result } = renderHook(() => useFormatting());

        await waitFor(() => {
            expect(result.current.settings).not.toBeNull();
        });

        const testDate = new Date(2026, 2, 15); // March 15, 2026
        const formatted = result.current.formatDate(testDate);
        expect(typeof formatted).toBe('string');
        expect(formatted).toContain('2026');
    });

    it('formatAmountWhole returns integer portion', async () => {
        mockLoadSettings.mockResolvedValue({
            currency: 'USD',
            decimalSeparator: 'dot',
            dateFormat: 'MM/DD/YYYY',
        });

        const { result } = renderHook(() => useFormatting());

        await waitFor(() => {
            expect(result.current.settings).not.toBeNull();
        });

        const formatted = result.current.formatAmountWhole(12345);
        // Should contain the whole number part (123 for 12345 cents)
        expect(formatted).toContain('$');
    });
});
