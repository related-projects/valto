import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { Profiler } from 'react';
import { Alert } from 'react-native';

import { memoryFiles } from '../../../tests/helpers/memoryFileSystem';
import i18n from '../../localization/i18n';
import { ExportScreen } from '../ExportScreen';

/**
 * ExportScreen - a PDF render that never finishes (REGISTRE V-94)
 *
 * expo-print settles its promise only once the page is written or the write
 * fails. A renderer that dies first settles nothing, so the export waited
 * forever: the spinner never cleared, and the failure alert, which sits in a
 * catch, never fired because nothing rejected. The render now has 30 seconds
 * (D1). On expiry the export rejects into the screen's existing catch with a
 * message of its own (D2), and a result that arrives after that changes nothing
 * (D3).
 *
 * T2 is a CONTROL, not a regression test. It passes on the code before the fix,
 * where no timer exists at all. It proves the guard leaves a normal export alone
 * and is disarmed once the render succeeds.
 *
 * `t` is the identity here, so an assertion reads the KEY. The clock is fake and
 * fixed mid-March in UTC, which is March in every zone.
 */

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

jest.mock('react-i18next', () => ({
    ...jest.requireActual('react-i18next'),
    useTranslation: () => ({ t: (key: string) => key }),
}));

// Plain functions, not jest.fn: nothing here asserts on the reads, and
// restoreAllMocks must not strip them between cases.
jest.mock('../../core/di/container', () => ({
    container: {
        transactionRepository: {
            getAll: async () => [],
            getByDateRange: async () => [],
        },
        walletRepository: { getAll: async () => [] },
        categoryRepository: { getAll: async () => [] },
    },
}));

jest.mock('../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../data/services/settingsService');
    return { ...actual, loadSettings: async () => actual.getDefaultSettings() };
});

const mockPrint = Print.printToFileAsync as jest.Mock;
const mockIsAvailable = Sharing.isAvailableAsync as jest.Mock;
const mockShare = Sharing.shareAsync as jest.Mock;

const PRINTED = 'file:///cache/Print/0d7c2b1e-printed.pdf';
const REPORT = 'file:///cache/valto_report_2026-03.pdf';
const SPINNER = 'export.generating';

type PrintResult = { uri: string; numberOfPages: number };

/** A render the test finishes by hand, whenever it chooses. */
function heldRender() {
    let finish!: (outcome: 'resolves' | 'rejects') => void;
    const promise = new Promise<PrintResult>((resolve, reject) => {
        finish = outcome => {
            if (outcome === 'resolves') {
                memoryFiles.add(PRINTED);
                resolve({ uri: PRINTED, numberOfPages: 1 });
            } else {
                reject(new Error('late native failure'));
            }
        };
    });
    return { promise, finish };
}

async function advance(ms: number): Promise<void> {
    await act(async () => {
        await jest.advanceTimersByTimeAsync(ms);
    });
}

/** Press Generate, then let the repository reads and settings resolve up to the render call. */
async function pressGenerate(): Promise<void> {
    await act(async () => {
        fireEvent.press(screen.getByLabelText('export.generatePdf'));
    });
    await advance(0);
}

beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-03-15T12:00:00Z') });
    memoryFiles.clear();
    mockPrint.mockReset();
    mockIsAvailable.mockReset().mockResolvedValue(true);
    mockShare.mockReset().mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
});

describe('ExportScreen - a PDF render that never finishes', () => {
    it('T1: a render that never settles is abandoned at 30 s: its own message, the spinner cleared, nothing shared', async () => {
        mockPrint.mockReturnValue(new Promise(() => undefined));
        render(<ExportScreen />);

        await pressGenerate();
        expect(mockPrint).toHaveBeenCalledTimes(1);
        expect(screen.getByText(SPINNER)).toBeTruthy();

        await advance(29_999);
        expect(Alert.alert).not.toHaveBeenCalled();
        expect(screen.getByText(SPINNER)).toBeTruthy();

        await advance(1);
        expect(Alert.alert).toHaveBeenCalledTimes(1);
        expect(Alert.alert).toHaveBeenCalledWith('export.exportFailed', 'export.exportTimedOutMessage');
        expect(screen.queryByText(SPINNER)).toBeNull();
        expect(mockShare).not.toHaveBeenCalled();

        // The body is a message of its own in every full bundle, not the generic one.
        for (const lng of ['en', 'es', 'fr', 'pt', 'ru']) {
            const body = i18n.getResource(lng, 'translation', 'export.exportTimedOutMessage');
            expect(typeof body).toBe('string');
            expect(body).not.toBe(i18n.getResource(lng, 'translation', 'export.exportFailedMessage'));
        }
    });

    it('T2 (control): a render that finishes well inside 30 s shares once, and nothing fires after', async () => {
        mockPrint.mockImplementation(
            () =>
                new Promise<PrintResult>(resolve => {
                    setTimeout(() => {
                        memoryFiles.add(PRINTED);
                        resolve({ uri: PRINTED, numberOfPages: 1 });
                    }, 1_000);
                }),
        );
        render(<ExportScreen />);

        await pressGenerate();
        await advance(1_000);

        expect(mockShare).toHaveBeenCalledTimes(1);
        expect(Alert.alert).not.toHaveBeenCalled();
        expect(screen.queryByText(SPINNER)).toBeNull();

        // The mirror of T3: long past the limit, a guard disarmed on success fires nothing.
        await advance(60_000);
        expect(Alert.alert).not.toHaveBeenCalled();
        expect(screen.queryByText(SPINNER)).toBeNull();
        expect(mockShare).toHaveBeenCalledTimes(1);
    });

    it.each(['resolves', 'rejects'] as const)(
        'T3: a render that %s after the timeout changes nothing: no share, no second alert, no re-render',
        async outcome => {
            const late = heldRender();
            mockPrint.mockReturnValue(late.promise);
            const onCommit = jest.fn();
            render(
                <Profiler id="export" onRender={onCommit}>
                    <ExportScreen />
                </Profiler>,
            );

            await pressGenerate();
            await advance(30_000);
            expect(Alert.alert).toHaveBeenCalledTimes(1);
            const commitsAtTimeout = onCommit.mock.calls.length;
            expect(commitsAtTimeout).toBeGreaterThan(0);

            await act(async () => {
                late.finish(outcome);
                await jest.advanceTimersByTimeAsync(0);
            });

            expect(mockShare).not.toHaveBeenCalled();
            expect(Alert.alert).toHaveBeenCalledTimes(1);
            expect(memoryFiles.has(REPORT)).toBe(false);
            // No state write: nothing on the screen committed again.
            expect(onCommit).toHaveBeenCalledTimes(commitsAtTimeout);
        },
    );
});
