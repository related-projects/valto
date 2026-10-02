/**
 * OnboardingScreen - the opening balance and the settings reload after the
 * currency is chosen
 *
 * REGISTRE V-124, lead from the pass 72 audit ("Possible window"). The
 * currency step saves the currency, then emits 'settings' and moves to the
 * wallet step at once (useOnboarding.ts:74-77); useFormatting reloads its
 * settings on that event without being awaited (useFormatting.ts:24-26). The
 * wallet step parses the opening balance with the exponent useFormatting holds
 * when Next is pressed. An amount must be saved in the minor units of the
 * currency chosen, or not saved at all; a refused amount is refused with a
 * message and an empty field means 0 (V-124, Owner decisions 1 and 2, pass 72).
 *
 * Runs against the real useOnboarding, useFormatting, settings service,
 * parser, event bus, container and runner, over an in-memory database. Only
 * translation and safe-area insets are mocked, as in
 * OnboardingScreen.openingBalance.test.tsx.
 *
 * The reload is held open at the storage read: the global AsyncStorage mock
 * (tests/setup/testSetup.ts) is wrapped so that a settings read made once XOF
 * is stored waits for the test to release it. Before the currency is written
 * nothing is stored, so the mount load (useFormatting.ts:23) and the read
 * inside setOnboardingCurrency (settingsService.ts:199) pass through; the
 * read the 'settings' event starts (useFormatting.ts:25) is the one held. Not
 * proved by this: how long that read takes on a device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { createTestDb } from '../../../../tests/helpers/createTestDb';
import { pressOnce, settle } from '../../../../tests/helpers/pressInOneBatch';
import { container } from '../../../core/di/container';
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

beforeEach(async () => {
    gate = deferred();
    reached = deferred();
    await AsyncStorage.clear();
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

describe('OnboardingScreen wallet step after the currency step: the settings reload', () => {
    it('V-124 lead: XOF chosen, 5000 typed and Next pressed before the settings reload lands: the wallet is saved at 5000 minor units or not at all', async () => {
        const screen = await reachWalletStepWithReloadHeld();
        // The window is open: the settings reload has reached its storage read
        // (awaited above) and the gate holding it has not been released.
        expect(await Promise.race([gate.promise, Promise.resolve('held')])).toBe('held');

        fireEvent.changeText(screen.getByTestId('onboarding_wallet_name'), 'Main');
        fireEvent.changeText(screen.getByTestId('onboarding_wallet_balance'), '5000');
        pressOnce(screen.getByTestId('onboarding_next_button'));
        await settle();

        gate.resolve();
        await settle();

        // Saved at 5000 minor units, or not saved at all.
        const saved = await walletBalances();
        expect(saved).toEqual(saved.length === 0 ? [] : [5000]);
    });

    it('control: the same flow with the reload landed before the press: the wallet is saved at 5000 minor units', async () => {
        const screen = await reachWalletStepWithReloadHeld();
        gate.resolve();
        await settle();
        // The reload landed: the field now uses the XOF exponent, 0.
        expect(screen.getByTestId('onboarding_wallet_balance').props.keyboardType).toBe('number-pad');

        fireEvent.changeText(screen.getByTestId('onboarding_wallet_name'), 'Main');
        fireEvent.changeText(screen.getByTestId('onboarding_wallet_balance'), '5000');
        pressOnce(screen.getByTestId('onboarding_next_button'));
        await waitFor(() => expect(screen.getByTestId('onboarding_complete_button')).toBeTruthy());
        await settle();

        expect(await walletBalances()).toEqual([5000]);
    });
});
