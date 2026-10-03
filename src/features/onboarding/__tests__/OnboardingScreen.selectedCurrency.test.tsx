/**
 * OnboardingScreen - the wallet step uses the currency just selected
 *
 * REGISTRE V-124, Owner decision 5 (pass 75): the onboarding wallet step
 * parses, converts and displays the opening balance with the currency the
 * user has just selected, whatever the state of the settings reload that
 * selection starts (useFormatting.ts:24-26, not awaited by
 * useOnboarding.ts:74-77). An amount the parser refuses is refused with a
 * message; an empty field means 0 (Owner decisions 1 and 2, pass 72).
 *
 * Runs against the real useOnboarding, useFormatting, settings service,
 * parser, event bus, container and runner, over an in-memory database. Only
 * translation and safe-area insets are mocked, as in
 * OnboardingScreen.openingBalance.test.tsx.
 *
 * The reload is held open at the storage read, as in
 * OnboardingScreen.currencyReload.test.tsx: a settings read made once XOF is
 * stored waits for the test to release it. The number format is seeded as
 * 'dot' before the screen mounts, so the run does not depend on the device
 * locale.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { createTestDb } from '../../../../tests/helpers/createTestDb';
import { pressOnce, settle } from '../../../../tests/helpers/pressInOneBatch';
import { container } from '../../../core/di/container';
import { loadSettings, saveSettings } from '../../../data/services/settingsService';
import { __setDatabaseForTests } from '../../../data/storage/sql/database';
import type { SqlDatabase } from '../../../data/storage/sql/SqlDatabase';
import { StorageKeys } from '../../../data/storage/StorageKeys';
import { OnboardingScreen } from '../screens/OnboardingScreen';

jest.mock('react-i18next', () => ({
    ...jest.requireActual('react-i18next'),
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params === undefined ? key : `${key} ${JSON.stringify(params)}`,
        i18n: { language: 'en' },
    }),
}));

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

interface Deferred {
    promise: Promise<void>;
    resolve: () => void;
}

function deferred(): Deferred {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

type GetItem = (key: string, ...rest: unknown[]) => Promise<string | null>;

const getItemMock = AsyncStorage.getItem as unknown as jest.Mock;
const realGetItem = getItemMock.getMockImplementation() as GetItem;

let db: SqlDatabase;
/** Released by the test: the held settings reads then return. */
let gate: Deferred;
/** Resolved when the first settings read is held: the reload has started and not landed. */
let reached: Deferred;

/**
 * Hold every settings read made once XOF is stored, until `gate` is released.
 * The value returned is the one read when the read was made.
 */
function holdSettingsReloadAfterXof(): void {
    getItemMock.mockImplementation(async (key: string, ...rest: unknown[]) => {
        const value = await realGetItem(key, ...rest);
        if (key === StorageKeys.SETTINGS && value !== null && JSON.parse(value).currency === 'XOF') {
            reached.resolve();
            await gate.promise;
        }
        return value;
    });
}

async function walletBalances(): Promise<number[]> {
    const { rows } = await db.execute('SELECT balance FROM wallets');
    return rows.map(row => Number(row.balance));
}

/**
 * From the welcome step, pick XOF and reach the wallet step while the
 * settings reload the currency press started is held.
 */
async function reachWalletStepWithReloadHeld() {
    holdSettingsReloadAfterXof();
    const screen = render(<OnboardingScreen onComplete={jest.fn()} />);
    await settle();
    pressOnce(screen.getByTestId('onboarding_get_started'));
    fireEvent.changeText(screen.getByTestId('currency_search_input'), 'XOF');
    pressOnce(screen.getByTestId('currency_item_XOF'));
    await waitFor(() => expect(screen.getByTestId('onboarding_wallet_name')).toBeTruthy());
    await reached.promise;
    return screen;
}

type Screen = Awaited<ReturnType<typeof reachWalletStepWithReloadHeld>>;

/** What the wallet step shows for its balance field, then what "12.50" and Next lead to. */
async function walletStepWith1250(screen: Screen) {
    const balance = screen.getByTestId('onboarding_wallet_balance');
    const placeholder = balance.props.placeholder;
    const keyboardType = balance.props.keyboardType;

    fireEvent.changeText(screen.getByTestId('onboarding_wallet_name'), 'Main');
    fireEvent.changeText(screen.getByTestId('onboarding_wallet_balance'), '12.50');
    pressOnce(screen.getByTestId('onboarding_next_button'));
    await settle();

    const error = screen.queryByTestId('onboarding_wallet_error');
    return {
        placeholder,
        keyboardType,
        error: error === null ? null : error.props.children,
        balances: await walletBalances(),
    };
}

/** XOF has no decimals: its placeholder, its keyboard, and the existing refusal of "12.50". */
const XOF_EXPECTED = {
    placeholder: '0',
    keyboardType: 'number-pad',
    error: 'common.amountErrors.tooManyDecimals {"example":"0"}',
    balances: [],
};

beforeEach(async () => {
    gate = deferred();
    reached = deferred();
    await AsyncStorage.clear();
    await saveSettings({ ...(await loadSettings()), decimalSeparator: 'dot' });
    db = await createTestDb({ writeGuard: true });
    __setDatabaseForTests(db);
    container.reset();
});

afterEach(() => {
    gate.resolve();
    getItemMock.mockImplementation(realGetItem);
    __setDatabaseForTests(null);
    container.reset();
});

describe('OnboardingScreen wallet step: the currency just selected, whatever the settings reload', () => {
    it('V-124 B1. reload held: the wallet step shows the XOF placeholder and keyboard, and "12.50" is refused with the existing message, no wallet saved', async () => {
        const screen = await reachWalletStepWithReloadHeld();

        const outcome = await walletStepWith1250(screen);
        gate.resolve();
        await settle();

        expect({ ...outcome, balances: await walletBalances() }).toEqual(XOF_EXPECTED);
    });

    it('control: the same with the reload landed first: XOF placeholder and keyboard, "12.50" refused, no wallet saved', async () => {
        const screen = await reachWalletStepWithReloadHeld();
        gate.resolve();
        await settle();

        expect(await walletStepWith1250(screen)).toEqual(XOF_EXPECTED);
    });
});
