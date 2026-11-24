/**
 * TransactionDetailsModal - a transfer note's prefix is shown in the app language
 *
 * REGISTRE C38, Owner decisions 24/11, decision 1, option A. transferFunds
 * stores "Transfer to <wallet>" / "Transfer from <wallet>" (+ " - <typed note>",
 * V-129) in English whatever the language, and the detail screen printed it
 * raw. Display-time translation of the prefix only: the wallet name and the
 * typed note are shown as stored, and storage is unchanged.
 *
 * Recognised only on a transfer leg whose reserved category matches its
 * prefix (transfer-out with "Transfer to ", transfer-in with "Transfer from ");
 * any other note is shown exactly as typed (controls).
 *
 * Real fr and en resources. French expected strings are ASCII ("Transfert
 * vers"); the incoming prefix is read from fr.json (pass 101b item 6 changed
 * its value). Harness from TransactionDetailsModal.exactAmount.test.tsx.
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { getDefaultSettings } from '../../../data/services/settingsService';
import i18n from '../../../localization/i18n';
import frBundle from '../../../localization/locales/fr.json';
import { TransactionDetailsModal } from '../TransactionDetailsModal';

// `mock` prefix so jest.mock() hoisting allows the reference.
let mockId = 'leg-out';

jest.mock('expo-router', () => ({
    useLocalSearchParams: () => ({ id: mockId }),
    useRouter: () => ({ push: jest.fn() }),
    router: { back: jest.fn() },
    Stack: { Screen: () => null },
}));

jest.mock('../../../hooks/useTransactions', () => {
    const { makeTransaction } = jest.requireActual('../../../test-utils/testFactories');
    const { TransactionType: Type } = jest.requireActual('../../../domain/entities');
    const transactions = [
        makeTransaction({ id: 'leg-out', type: Type.TRANSFER, categoryId: 'transfer-out', walletId: 'wallet-1', note: 'Transfer to Banque - loyer' }),
        makeTransaction({ id: 'leg-in', type: Type.TRANSFER, categoryId: 'transfer-in', walletId: 'wallet-2', note: 'Transfer from Caisse' }),
        makeTransaction({ id: 'expense', type: Type.EXPENSE, note: 'Transfer to Mum' }),
        makeTransaction({ id: 'mismatch', type: Type.TRANSFER, categoryId: 'transfer-in', walletId: 'wallet-2', note: 'Transfer to Banque' }),
    ];
    return {
        useTransactions: () => ({ transactions, loading: false, deleteTransaction: jest.fn() }),
    };
});

jest.mock('../../../hooks/useCategories', () => ({
    useCategories: () => ({
        categories: [{ id: 'cat-food', name: 'Groceries', type: 'expense', icon: 'restaurant', color: '#F59E0B' }],
        loading: false,
        error: null,
    }),
}));

jest.mock('../../../hooks/useWallets', () => ({
    useWallets: () => ({
        wallets: [
            { id: 'wallet-1', name: 'Caisse', balance: 0, type: 'cash' },
            { id: 'wallet-2', name: 'Banque', balance: 0, type: 'bank' },
        ],
        loading: false,
        error: null,
    }),
}));

jest.mock('../../../data/services/settingsService', () => {
    const actual = jest.requireActual('../../../data/services/settingsService');
    return { ...actual, loadSettings: jest.fn() };
});

const mockedLoadSettings = jest.requireMock('../../../data/services/settingsService')
    .loadSettings as jest.Mock;

beforeEach(async () => {
    jest.clearAllMocks();
    mockedLoadSettings.mockResolvedValue({ ...getDefaultSettings(), currency: 'USD', language: 'fr' });
    await i18n.changeLanguage('fr');
});

afterAll(async () => {
    await i18n.changeLanguage('en');
});

describe('C38 TransactionDetailsModal transfer note', () => {
    it('fr: the outgoing leg reads "Transfert vers Banque - loyer"', async () => {
        mockId = 'leg-out';
        render(<TransactionDetailsModal />);

        expect(await screen.findByText('Transfert vers Banque - loyer')).toBeTruthy();
        expect(screen.queryByText('Transfer to Banque - loyer')).toBeNull();
    });

    it('fr: the incoming leg reads the fr incoming prefix followed by "Caisse"', async () => {
        mockId = 'leg-in';
        render(<TransactionDetailsModal />);

        expect(await screen.findByText(`${frBundle.transactions.transferNote.from} Caisse`)).toBeTruthy();
    });

    it('control: en shows the stored note byte for byte', async () => {
        await i18n.changeLanguage('en');
        mockId = 'leg-out';
        render(<TransactionDetailsModal />);

        expect(await screen.findByText('Transfer to Banque - loyer')).toBeTruthy();
    });

    it('control: an expense note that starts with "Transfer to " is shown as typed', async () => {
        mockId = 'expense';
        render(<TransactionDetailsModal />);

        expect(await screen.findByText('Transfer to Mum')).toBeTruthy();
    });

    it('control: a prefix that does not match the leg category is shown as stored', async () => {
        mockId = 'mismatch';
        render(<TransactionDetailsModal />);

        expect(await screen.findByText('Transfer to Banque')).toBeTruthy();
    });
});
