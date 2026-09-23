import { render } from '@testing-library/react-native';
import React from 'react';

import { RecurringRuleForm } from '../RecurringRuleForm';

/**
 * RecurringRuleForm - the start date honours the dateFormat setting
 *
 * Decimals audit, defect 3. The form declared its own
 * `const formatDate = (d: Date) => d.toLocaleDateString()`, shadowing the one
 * useFormatting already offers. That call takes no locale and no options, so
 * the date followed the DEVICE, and the user's dateFormat preference - honoured
 * by every other date in the app - was ignored on this one screen.
 *
 * D4: the shadow is gone and the form takes formatDate from the hook. A
 * sentinel is returned from the mocked hook so the assertion cannot depend on
 * the machine time zone or on Node's ICU: anything other than the sentinel
 * means the component is still formatting the date itself.
 */

const FORMATTED_BY_THE_HOOK = 'date-from-useFormatting';

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: () => ({ wallets: [] }),
}));

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: () => ({ categories: [] }),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

jest.mock('../../../hooks/useFormatting', () => ({
    useFormatting: () => ({
        formatAmount: (v: number) => String(v),
        formatDate: () => 'date-from-useFormatting',
        centsToMajor: (v: number) => v / 100,
        parseAmountToCents: (v: string) => (v ? Number(v) : null),
        parseAmountToCentsResult: (v: string) =>
            v ? { ok: true, value: Number(v) } : { ok: false, cause: 'empty' },
        amountPlaceholder: '0.00',
        decimals: 2,
    }),
}));

describe('RecurringRuleForm start date', () => {
    it('renders the date the formatting hook produced', () => {
        const { getByText } = render(
            <RecurringRuleForm onSubmit={jest.fn()} onCancel={jest.fn()} />,
        );

        expect(getByText(FORMATTED_BY_THE_HOOK)).toBeTruthy();
    });
});
