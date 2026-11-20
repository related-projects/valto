/**
 * Export: the PDF period selector with a start day (REGISTRE C20 step 2, pass
 * 98 items 4 and 6).
 *
 * With start day 20 the selector names the period by its dates, starts on the
 * period of the clock (25 Nov 2026 -> 20 Nov - 19 Dec 2026, named 2026-12),
 * steps by period, and the PDF reads the selected period's transactions.
 * With start day 1 it shows "November 2026" as before
 * (ExportScreen.renderTimeout.test.tsx).
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React from 'react';

import { memoryFiles } from '../../../tests/helpers/memoryFileSystem';
import { pinClock, restoreZoneClock } from '../../../tests/helpers/zoneClock';
import i18n from '../../localization/i18n';
import { ExportScreen } from '../ExportScreen';

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));

jest.mock('expo-sharing', () => ({
    isAvailableAsync: jest.fn(),
    shareAsync: jest.fn(),
}));

jest.mock('expo-file-system', () =>
    jest.requireActual('../../../tests/helpers/memoryFileSystem').memoryFileSystemModule());

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
    useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

const mockGetByDateRange = jest.fn();

jest.mock('../../core/di/container', () => ({
    container: {
        transactionRepository: {
            getAll: async () => [],
            getByDateRange: (...args: unknown[]) => mockGetByDateRange(...args),
        },
        walletRepository: { getAll: async () => [] },
        categoryRepository: { getAll: async () => [] },
    },
}));

jest.mock('../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../data/services/settingsService');
    return { ...actual, loadSettings: async () => ({ ...actual.getDefaultSettings(), language: 'en', monthStartDay: 20 }) };
});

const PRINTED = 'file:///cache/Print/0d7c2b1e-printed.pdf';

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    pinClock(new Date(2026, 10, 25, 12, 0).getTime());
    memoryFiles.clear();
    mockGetByDateRange.mockReset().mockResolvedValue([]);
    (Print.printToFileAsync as jest.Mock).mockReset().mockImplementation(async () => {
        memoryFiles.add(PRINTED);
        return { uri: PRINTED, numberOfPages: 1 };
    });
    (Sharing.isAvailableAsync as jest.Mock).mockReset().mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
    restoreZoneClock();
});

describe('pass 98 item 6. the Export period selector with start day 20', () => {
    it('pass 98 item 6. shows the period dates, steps by period, and exports the selected period', async () => {
        render(<ExportScreen />);

        await waitFor(() => {
            expect(screen.getByText('20 Nov - 19 Dec 2026')).toBeTruthy();
        });

        fireEvent.press(screen.getByLabelText(i18n.t('a11y.previousMonth')));
        expect(screen.getByText('20 Oct - 19 Nov 2026')).toBeTruthy();

        await act(async () => {
            fireEvent.press(screen.getByLabelText(i18n.t('export.generatePdf')));
        });

        await waitFor(() => {
            expect(mockGetByDateRange).toHaveBeenCalledWith(
                new Date(2026, 9, 20),
                new Date(2026, 10, 19, 23, 59, 59, 999),
            );
        });
    });
});
