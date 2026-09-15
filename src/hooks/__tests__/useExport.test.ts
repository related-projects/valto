/**
 * useExport Hook Tests
 *
 * Tests CSV/PDF export functionality, loading states and date range
 * calculation.
 *
 * The hook holds no `error` state, so nothing here asserts one. The four tests
 * that did were removed with the field. Note what that leaves uncovered: no
 * test in this file exercises a failing export at all. ExportScreen is what
 * presents the failure, and ExportScreen has no test.
 */

import { act, renderHook } from '@testing-library/react-native';

// Mock the container and services
const mockGetAll = jest.fn();
const mockGetByDateRange = jest.fn();
const mockShareCSV = jest.fn();
const mockShareMonthlyPDF = jest.fn();

jest.mock('../../core/di/container', () => ({
    container: {
        get transactionRepository() {
            return { getAll: mockGetAll, getByDateRange: mockGetByDateRange };
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
    shareCSV: (...args: any[]) => mockShareCSV(...args),
    shareMonthlyPDF: (...args: any[]) => mockShareMonthlyPDF(...args),
}));

import { useExport } from '../useExport';

describe('useExport', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetAll.mockResolvedValue([]);
        mockGetByDateRange.mockResolvedValue([]);
        mockShareCSV.mockResolvedValue(undefined);
        mockShareMonthlyPDF.mockResolvedValue(undefined);
    });

    it('starts with loading false', () => {
        const { result } = renderHook(() => useExport());

        expect(result.current.loading).toBe(false);
    });

    it('exportCSV sets loading during execution', async () => {
        let resolveCSV: () => void;
        mockShareCSV.mockReturnValue(new Promise<void>(r => { resolveCSV = r; }));

        const { result } = renderHook(() => useExport());

        let exportPromise: Promise<void>;
        act(() => {
            exportPromise = result.current.exportCSV();
        });

        // Should be loading
        expect(result.current.loading).toBe(true);

        await act(async () => {
            resolveCSV!();
            await exportPromise!;
        });

        expect(result.current.loading).toBe(false);
    });

    it('exportCSV calls shareCSV with loaded data', async () => {
        const { result } = renderHook(() => useExport());

        await act(async () => {
            await result.current.exportCSV();
        });

        expect(mockShareCSV).toHaveBeenCalledTimes(1);
    });

    it('exportMonthlyPDF calls shareMonthlyPDF', async () => {
        const { result } = renderHook(() => useExport());

        await act(async () => {
            await result.current.exportMonthlyPDF(2026, 3);
        });

        expect(mockShareMonthlyPDF).toHaveBeenCalledTimes(1);
        expect(mockShareMonthlyPDF).toHaveBeenCalledWith(
            2026, 3,
            expect.any(Array),
            expect.any(Array),
            expect.any(Array),
        );
    });

    it('exportMonthlyPDF passes correct date range to repo', async () => {
        const { result } = renderHook(() => useExport());

        await act(async () => {
            await result.current.exportMonthlyPDF(2026, 3);
        });

        // Should query March 1 to March 31
        expect(mockGetByDateRange).toHaveBeenCalledWith(
            new Date(2026, 2, 1),        // March 1
            new Date(2026, 3, 0, 23, 59, 59, 999), // March 31 23:59:59.999
        );
    });

});
