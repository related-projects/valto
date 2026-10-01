/**
 * OnboardingScreen - two presses in one event batch create one wallet
 *
 * REGISTRE V-123 (pass 68). The wallet step's Next button was guarded only by
 * `disabled={loading}`, which reaches Pressability after the commit, so a
 * second press delivered in the same event batch as the first ran
 * handleCreateWallet again and created a second wallet, whose opening balance
 * the total then counted twice. The presses go through
 * tests/helpers/pressInOneBatch.ts, against the real useOnboarding hook, the
 * real container and runner, and an in-memory database.
 *
 * On this step an empty name falls back to the placeholder. The refused input
 * used below is the one the repository refuses: a negative opening balance on
 * a cash wallet. The screen's own refusal of an amount the parser cannot read
 * (REGISTRE V-124) is covered by OnboardingScreen.openingBalance.test.tsx.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { createTestDb } from '../../../../tests/helpers/createTestDb';
import { pressOnce, pressTwiceInOneBatch, settle } from '../../../../tests/helpers/pressInOneBatch';
import { container } from '../../../core/di/container';
import { __setDatabaseForTests } from '../../../data/storage/sql/database';
import type { SqlDatabase } from '../../../data/storage/sql/SqlDatabase';
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

// The production parser and conversion, pinned to a two-decimal currency and
// the dot profile so the result does not depend on the device locale.
jest.mock('../../../hooks/useFormatting', () => {
    const { normalizeAmount, parseAmountInput, parseAmountInputResult } = jest.requireActual('../../../utils/normalizeAmount');
    return {
        useFormatting: () => ({
            parseAmount: (v: string) => parseAmountInput(v, 'dot', 2),
            parseAmountResult: (v: string) => parseAmountInputResult(v, 'dot', 2),
            normalizeAmount: (v: number) => normalizeAmount(v, 2),
            amountPlaceholder: '0.00',
            decimals: 2,
        }),
    };
});

const OPENING_INPUT = '300';
const OPENING = 30000;

let db: SqlDatabase;

async function count(sql: string): Promise<number> {
    const { rows } = await db.execute(sql);
    return Number(rows[0].n);
}

async function totalBalance(): Promise<number> {
    const { rows } = await db.execute('SELECT SUM(balance) AS total FROM wallets');
    return Number(rows[0].total);
}

/** Walk from the welcome step through the currency step to the wallet step. */
async function renderAtWalletStep() {
    const screen = render(<OnboardingScreen onComplete={jest.fn()} />);
    pressOnce(screen.getByTestId('onboarding_get_started'));
    fireEvent.changeText(screen.getByTestId('currency_search_input'), 'EUR');
    pressOnce(screen.getByTestId('currency_item_EUR'));
    await waitFor(() => expect(screen.getByTestId('onboarding_wallet_name')).toBeTruthy());
    return screen;
}

beforeEach(async () => {
    await AsyncStorage.clear();
    db = await createTestDb({ writeGuard: true });
    __setDatabaseForTests(db);
    container.reset();
});

afterEach(() => {
    __setDatabaseForTests(null);
    container.reset();
});

describe('OnboardingScreen wallet step submit lock', () => {
    it('V-123: two presses in one event batch create one wallet and count its opening balance once', async () => {
        const screen = await renderAtWalletStep();
        fireEvent.changeText(screen.getByTestId('onboarding_wallet_name'), 'Main');
        fireEvent.changeText(screen.getByTestId('onboarding_wallet_balance'), OPENING_INPUT);

        pressTwiceInOneBatch(screen.getByTestId('onboarding_next_button'));
        await waitFor(() => expect(screen.getByTestId('onboarding_complete_button')).toBeTruthy());
        await settle();

        expect(await count('SELECT COUNT(*) AS n FROM wallets')).toBe(1);
        expect(await totalBalance()).toBe(OPENING);
    });

    it('control: a single press creates one wallet', async () => {
        const screen = await renderAtWalletStep();
        fireEvent.changeText(screen.getByTestId('onboarding_wallet_name'), 'Main');
        fireEvent.changeText(screen.getByTestId('onboarding_wallet_balance'), OPENING_INPUT);

        pressOnce(screen.getByTestId('onboarding_next_button'));
        await waitFor(() => expect(screen.getByTestId('onboarding_complete_button')).toBeTruthy());
        await settle();

        expect(await count('SELECT COUNT(*) AS n FROM wallets')).toBe(1);
        expect(await totalBalance()).toBe(OPENING);
    });

    it('control: a negative opening balance on a cash wallet is refused, then a corrected balance creates one wallet', async () => {
        const screen = await renderAtWalletStep();
        fireEvent.changeText(screen.getByTestId('onboarding_wallet_name'), 'Main');
        fireEvent.changeText(screen.getByTestId('onboarding_wallet_balance'), '-300');

        pressOnce(screen.getByTestId('onboarding_next_button'));
        await waitFor(() =>
            expect(screen.getByTestId('onboarding_wallet_error')).toHaveTextContent('onboarding.walletCreateFailed'),
        );
        await settle();
        expect(await count('SELECT COUNT(*) AS n FROM wallets')).toBe(0);

        fireEvent.changeText(screen.getByTestId('onboarding_wallet_balance'), OPENING_INPUT);
        pressOnce(screen.getByTestId('onboarding_next_button'));
        await waitFor(() => expect(screen.getByTestId('onboarding_complete_button')).toBeTruthy());
        await settle();

        expect(await count('SELECT COUNT(*) AS n FROM wallets')).toBe(1);
        expect(await totalBalance()).toBe(OPENING);
    });
});
