/**
 * OnboardingScreen - an opening balance above the cap is refused (REGISTRE V-128)
 *
 * The wallet step reads its opening balance through the shared parser, under
 * the currency just selected (REGISTRE V-124). Above 999 999 999 999 minor
 * units it now keeps the step, shows the tooLarge sentence at the wallet-step
 * error line, naming the maximum in the selected currency, and creates no
 * wallet. The tests named "control" pass before the fix: the cap itself is
 * stored as the opening balance, exactly.
 *
 * Runs against the real useOnboarding hook, the real container and runner,
 * and an in-memory database, as OnboardingScreen.openingBalance.test.tsx does.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { CAP_CASES, CAP_MINOR, echoedTooLarge, type CapCase } from '../../../../tests/helpers/amountCapCases';
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

// The number format the settings carry; the exponent comes from the currency
// the step selects, so the hook's own exponent stays at the default.
let mockProfile: NumberFormatProfile = 'dot';

jest.mock('../../../hooks/useFormatting', () => {
    const { amountPlaceholder } = jest.requireActual('../../../utils/amountPlaceholder');
    return {
        useFormatting: () => ({
            amountPlaceholder: amountPlaceholder(2, mockProfile),
            decimals: 2,
            settings: { decimalSeparator: mockProfile },
        }),
    };
});

let db: SqlDatabase;

async function walletBalances(): Promise<number[]> {
    const { rows } = await db.execute('SELECT balance, opening_balance FROM wallets');
    return rows.flatMap(row => [Number(row.balance), Number(row.opening_balance)]);
}

/** Walk to the wallet step with `c` selected, type `balance`, press Next. */
async function submitBalance(c: CapCase, balance: string) {
    mockProfile = c.profile;
    const screen = render(<OnboardingScreen onComplete={jest.fn()} />);
    pressOnce(screen.getByTestId('onboarding_get_started'));
    fireEvent.changeText(screen.getByTestId('currency_search_input'), c.code);
    pressOnce(screen.getByTestId(`currency_item_${c.code}`));
    await waitFor(() => expect(screen.getByTestId('onboarding_wallet_name')).toBeTruthy());
    expect(screen.getByTestId('onboarding_wallet_balance').props.keyboardType).toBe(c.keyboardType);

    fireEvent.changeText(screen.getByTestId('onboarding_wallet_name'), 'Main');
    fireEvent.changeText(screen.getByTestId('onboarding_wallet_balance'), balance);
    pressOnce(screen.getByTestId('onboarding_next_button'));
    await settle();
    return screen;
}

beforeEach(async () => {
    mockProfile = 'dot';
    await AsyncStorage.clear();
    db = await createTestDb({ writeGuard: true });
    __setDatabaseForTests(db);
    container.reset();
});

afterEach(() => {
    __setDatabaseForTests(null);
    container.reset();
});

const BY_CODE = CAP_CASES.map((c): [string, CapCase] => [c.code, c]);

describe('V-128 OnboardingScreen opening balance cap', () => {
    it.each(BY_CODE)('V-128 %s: the cap plus one is refused with the maximum, and no wallet is created', async (_code, c) => {
        const screen = await submitBalance(c, c.overInput);

        expect(await walletBalances()).toEqual([]);
        expect(screen.queryByTestId('onboarding_complete_button')).toBeNull();
        expect(screen.getByTestId('onboarding_wallet_error').props.children).toBe(echoedTooLarge(c.max));
    });

    it.each(BY_CODE)('control: %s: the cap is stored as the opening balance, exactly 999999999999', async (_code, c) => {
        const screen = await submitBalance(c, c.capInput);

        await waitFor(() => expect(screen.getByTestId('onboarding_complete_button')).toBeTruthy());
        expect(screen.queryByTestId('onboarding_wallet_error')).toBeNull();
        expect(await walletBalances()).toEqual([CAP_MINOR, CAP_MINOR]);
    });
});
