/**
 * TransactionList - the date section headers follow the active theme
 * (REGISTRE C44, pass 101b item 2)
 *
 * The header band had a fixed light background ('#f7f8f7'), so in the dark
 * theme each date header was a light stripe across a dark list. It now uses
 * the theme's background token, which in the light theme is that same
 * '#f7f8f7'. The header text already used the theme's mutedForeground.
 *
 * The list renders inside the real ThemeProvider; the theme comes from the
 * stored settings (loadSettings, mocked). The precondition - the header text
 * colour - does not depend on the fix: it shows the dark theme has reached the
 * list. The light case is a control: it passes before and after the fix.
 *
 * Harness as in TransactionList.testIDs.test.tsx.
 */

import { render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { pinClock, restoreZoneClock } from '../../../../tests/helpers/zoneClock';
import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import { makeTransaction } from '../../../test-utils/testFactories';
import { palette } from '../../../theme/colors';
import { ThemeProvider } from '../../../theme/ThemeContext';
import { TransactionList } from '../TransactionList';

jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: () => ({
        categories: [{ id: 'cat-food', name: 'Groceries', type: 'expense', icon: 'restaurant', color: '#F59E0B' }],
    }),
}));

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: () => ({ wallets: [{ id: 'wallet-1', name: 'Cash Wallet', balance: 0, type: 'cash' }] }),
}));

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

/** 10 Nov 2026, 12:00 UTC: the transaction below is dated "now", so its header reads Today. */
const NOW = Date.UTC(2026, 10, 10, 12, 0);

interface Node {
    props: Record<string, unknown>;
    parent: Node | null;
}

/** The first background colour found on `node` or above it. */
function backgroundAbove(node: Node): unknown {
    for (let current: Node | null = node; current !== null; current = current.parent) {
        const style = StyleSheet.flatten(current.props.style as never) as { backgroundColor?: unknown } | undefined;
        if (style?.backgroundColor !== undefined) return style.backgroundColor;
    }
    return undefined;
}

function textColor(node: Node): unknown {
    return (StyleSheet.flatten(node.props.style as never) as { color?: unknown } | undefined)?.color;
}

beforeAll(async () => {
    await i18n.changeLanguage('en');
});

beforeEach(() => {
    jest.clearAllMocks();
    pinClock(NOW);
});

afterEach(() => {
    restoreZoneClock();
});

function renderList(theme: 'light' | 'dark') {
    mockedLoadSettings.mockResolvedValue({ ...getDefaultSettings(), theme });
    const tx = makeTransaction({ id: 'tx-today', date: new Date(NOW), createdAt: new Date(NOW) });
    return render(
        <ThemeProvider>
            <TransactionList transactions={[tx]} showDateHeaders />
        </ThemeProvider>,
    );
}

describe('C44 pass 101b item 2. TransactionList date headers', () => {
    it('C44 pass 101b item 2: in the dark theme the header background is the dark background token', async () => {
        const { getByText } = renderList('dark');

        // Precondition, independent of the fix: the dark theme has reached the header text.
        await waitFor(() => {
            expect(textColor(getByText('Today') as unknown as Node)).toBe(palette.dark.mutedForeground);
        });

        expect(backgroundAbove(getByText('Today') as unknown as Node)).toBe(palette.dark.background);
    });

    it('control: in the light theme the header background is the light background token', async () => {
        const { getByText } = renderList('light');

        await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalled());
        await waitFor(() => {
            expect(textColor(getByText('Today') as unknown as Node)).toBe(palette.light.mutedForeground);
        });

        expect(backgroundAbove(getByText('Today') as unknown as Node)).toBe(palette.light.background);
    });
});
