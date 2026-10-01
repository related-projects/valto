/**
 * OnboardingScreen - an opening balance the parser refuses
 *
 * REGISTRE V-124 (pass 72). The wallet step read its balance field with
 * `parseAmount(initialBalance) ?? 0`, so an amount the parser refused - a dot
 * under the space profile, letters, more decimals than the currency has -
 * created the wallet at 0 and moved on, with no message. A refused amount now
 * creates nothing, keeps the step, and says why at the wallet-step error line.
 * An empty field still means "start at zero" (Owner decision 1), and a
 * negative balance is still left to the repository (Owner decision 3).
 *
 * Runs against the real useOnboarding hook, the real container and runner,
 * and an in-memory database, as OnboardingScreen.submitLock.test.tsx does.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { createTestDb } from '../../../../tests/helpers/createTestDb';
import { pressOnce, settle } from '../../../../tests/helpers/pressInOneBatch';
import { container } from '../../../core/di/container';
import { __setDatabaseForTests } from '../../../data/storage/sql/database';
import type { SqlDatabase } from '../../../data/storage/sql/SqlDatabase';
import type { NumberFormatProfile } from '../../../domain/entities/Settings';
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

// The production parser, conversion and placeholder, under the profile and
// exponent each test sets, so the result does not depend on the device locale.
let mockProfile: NumberFormatProfile = 'dot';
let mockDecimals = 2;

jest.mock('../../../hooks/useFormatting', () => {
    const { normalizeAmount, parseAmountInput, parseAmountInputResult } = jest.requireActual('../../../utils/normalizeAmount');
    const { amountPlaceholder } = jest.requireActual('../../../utils/amountPlaceholder');
    return {
        useFormatting: () => ({
            parseAmount: (v: string) => parseAmountInput(v, mockProfile, mockDecimals),
            parseAmountResult: (v: string) => parseAmountInputResult(v, mockProfile, mockDecimals),
            normalizeAmount: (v: number) => normalizeAmount(v, mockDecimals),
            amountPlaceholder: amountPlaceholder(mockDecimals, mockProfile),
            decimals: mockDecimals,
        }),
    };
});

let db: SqlDatabase;

async function walletBalances(): Promise<number[]> {
    const { rows } = await db.execute('SELECT balance FROM wallets');
    return rows.map(row => Number(row.balance));
}

/** Walk from the welcome step through the currency step to the wallet step. */
async function renderAtWalletStep(currencyCode: string) {
    const screen = render(<OnboardingScreen onComplete={jest.fn()} />);
    pressOnce(screen.getByTestId('onboarding_get_started'));
    fireEvent.changeText(screen.getByTestId('currency_search_input'), currencyCode);
    pressOnce(screen.getByTestId(`currency_item_${currencyCode}`));
    await waitFor(() => expect(screen.getByTestId('onboarding_wallet_name')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('onboarding_wallet_name'), 'Main');
    return screen;
}

async function submitBalance(screen: Awaited<ReturnType<typeof renderAtWalletStep>>, balance: string) {
    fireEvent.changeText(screen.getByTestId('onboarding_wallet_balance'), balance);
    pressOnce(screen.getByTestId('onboarding_next_button'));
    await settle();
}

beforeEach(async () => {
    mockProfile = 'dot';
    mockDecimals = 2;
    await AsyncStorage.clear();
    db = await createTestDb({ writeGuard: true });
    __setDatabaseForTests(db);
    container.reset();
});

afterEach(() => {
    __setDatabaseForTests(null);
    container.reset();
});

describe('OnboardingScreen wallet step opening balance', () => {
    it('V-124 a: space profile, 2 decimals: "12.50" is refused with a message and creates no wallet', async () => {
        mockProfile = 'space';
        const screen = await renderAtWalletStep('EUR');

        await submitBalance(screen, '12.50');

        expect(await walletBalances()).toEqual([]);
        expect(screen.queryByTestId('onboarding_complete_button')).toBeNull();
        expect(screen.getByTestId('onboarding_wallet_balance')).toBeTruthy();
        expect(screen.getByTestId('onboarding_wallet_error')).toHaveTextContent('common.amountErrors.notANumber');
    });

    it('V-124 b: dot profile, 2 decimals: "abc" is refused with a message and creates no wallet', async () => {
        const screen = await renderAtWalletStep('EUR');

        await submitBalance(screen, 'abc');

        expect(await walletBalances()).toEqual([]);
        expect(screen.queryByTestId('onboarding_complete_button')).toBeNull();
        expect(screen.getByTestId('onboarding_wallet_balance')).toBeTruthy();
        expect(screen.getByTestId('onboarding_wallet_error')).toHaveTextContent('common.amountErrors.notANumber');
    });

    it('V-124 c: 0 decimals: "12,50" is refused with a message naming the accepted shape and creates no wallet', async () => {
        mockProfile = 'space';
        mockDecimals = 0;
        const screen = await renderAtWalletStep('XOF');

        await submitBalance(screen, '12,50');

        expect(await walletBalances()).toEqual([]);
        expect(screen.queryByTestId('onboarding_complete_button')).toBeNull();
        expect(screen.getByTestId('onboarding_wallet_balance')).toBeTruthy();
        expect(screen.getByTestId('onboarding_wallet_error')).toHaveTextContent(
            'common.amountErrors.tooManyDecimals {"example":"0"}',
        );
    });

    it('V-124 d: after a refusal, a corrected balance and one press create exactly one wallet at that balance', async () => {
        const screen = await renderAtWalletStep('EUR');

        await submitBalance(screen, 'abc');
        expect(screen.getByTestId('onboarding_wallet_error')).toHaveTextContent('common.amountErrors.notANumber');

        fireEvent.changeText(screen.getByTestId('onboarding_wallet_balance'), '300');
        expect(screen.queryByTestId('onboarding_wallet_error')).toBeNull();

        pressOnce(screen.getByTestId('onboarding_next_button'));
        await waitFor(() => expect(screen.getByTestId('onboarding_complete_button')).toBeTruthy());
        await settle();

        expect(await walletBalances()).toEqual([30000]);
    });

    it('control: an empty balance field creates the wallet with balance 0', async () => {
        const screen = await renderAtWalletStep('EUR');

        pressOnce(screen.getByTestId('onboarding_next_button'));
        await waitFor(() => expect(screen.getByTestId('onboarding_complete_button')).toBeTruthy());
        await settle();

        expect(await walletBalances()).toEqual([0]);
    });

    it('control: "300" creates the wallet with 300 in minor units', async () => {
        const screen = await renderAtWalletStep('EUR');

        fireEvent.changeText(screen.getByTestId('onboarding_wallet_balance'), '300');
        pressOnce(screen.getByTestId('onboarding_next_button'));
        await waitFor(() => expect(screen.getByTestId('onboarding_complete_button')).toBeTruthy());
        await settle();

        expect(await walletBalances()).toEqual([30000]);
    });

    it('control: "-300" on a cash wallet is refused with onboarding.walletCreateFailed and creates no wallet', async () => {
        const screen = await renderAtWalletStep('EUR');

        await submitBalance(screen, '-300');

        await waitFor(() =>
            expect(screen.getByTestId('onboarding_wallet_error')).toHaveTextContent('onboarding.walletCreateFailed'),
        );
        expect(await walletBalances()).toEqual([]);
        expect(screen.queryByTestId('onboarding_complete_button')).toBeNull();
    });
});
