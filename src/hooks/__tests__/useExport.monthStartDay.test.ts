/**
 * useExport queries the period of the stored start day (REGISTRE C20 step 2,
 * pass 98 item 4).
 *
 * With start day 20, period 2026-12 is 20 Nov - 19 Dec 2026 (start days 16-31
 * name the month after the start), so the PDF reads its transactions from 20
 * November 00:00 to 19 December 23:59:59.999, local time. With start day 1 the
 * range is the calendar month (useExport.test.ts).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { StorageKeys } from '../../data/storage';
import { useExport } from '../useExport';

const mockGetByDateRange = jest.fn();
const mockShareMonthlyPDF = jest.fn();

jest.mock('../../core/di/container', () => ({
    container: {
        get transactionRepository() {
            return { getAll: jest.fn().mockResolvedValue([]), getByDateRange: mockGetByDateRange };
        },
        get walletRepository() {
            return { getAll: jest.fn().mockResolvedValue([]) };
        },
        get categoryRepository() {
            return { getAll: jest.fn().mockResolvedValue([]) };
        },
    },
}));

jest.mock('../../data/services/export/TransactionExportService', () => ({
    shareCSV: jest.fn(),
    shareMonthlyPDF: (...args: any[]) => mockShareMonthlyPDF(...args),
}));

beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockGetByDateRange.mockResolvedValue([]);
    mockShareMonthlyPDF.mockResolvedValue(undefined);
});

describe('pass 98 item 4. useExport with start day 20', () => {
    it('pass 98 item 4. reads period 2026-12 from 20 Nov to 19 Dec', async () => {
        await AsyncStorage.setItem(StorageKeys.SETTINGS, JSON.stringify({
            language: 'en',
            currency: 'USD',
            dateFormatLocaleApplied: true,
            monthStartDay: 20,
        }));
        const { result } = renderHook(() => useExport());

        await act(async () => {
            await result.current.exportMonthlyPDF(2026, 12);
        });

        expect(mockGetByDateRange).toHaveBeenCalledWith(
            new Date(2026, 10, 20),
            new Date(2026, 11, 19, 23, 59, 59, 999),
        );
    });
});
