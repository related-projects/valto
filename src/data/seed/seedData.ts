/**
 * Seed Data Definitions
 *
 * Default wallets and categories for new installations.
 *
 * Architecture Note:
 * This data is only used for initial setup. Once the user has data in storage,
 * these defaults are never applied again.
 *
 * Why the labels below are plain French literals and not i18n keys:
 * wallets and categories are USER DATA, not UI strings. A user can add their own
 * categories, and can rename any default into any language - including one the app
 * does not ship a translation for. Running these labels through i18n would fight
 * that: translated defaults would sit inconsistently next to untranslated user
 * entries, and a re-translation would overwrite a name the user deliberately chose.
 * So the app writes an initial label once, at install time, and never re-translates it.
 */

import { CategoryType, CreateCategoryDTO } from '../../domain/entities/Category';
import { CreateWalletDTO, WalletType } from '../../domain/entities/Wallet';

/**
 * Default wallets for new users
 */
export const defaultWallets: CreateWalletDTO[] = [
    {
        name: 'Espèces',
        balance: 0,
        type: WalletType.CASH,
        color: '#5D6D7E',
    },
    {
        name: 'Compte bancaire',
        balance: 0,
        type: WalletType.BANK,
        color: '#4A5568',
    },
    // {
    //     name: 'Mobile Money',
    //     balance: 0,
    //     type: WalletType.MOBILE,
    //     color: '#6B7280',
    // },
    {
        name: 'Épargne',
        balance: 0,
        type: WalletType.SAVINGS,
        color: '#78716C',
    },
];

/**
 * Default expense categories
 */
export const defaultExpenseCategories: CreateCategoryDTO[] = [
    {
        name: 'Nourriture',
        type: CategoryType.EXPENSE,
        icon: 'restaurant',
        color: '#FFB74D',
    },
    {
        name: 'Transport',
        type: CategoryType.EXPENSE,
        icon: 'car',
        color: '#64B5F6',
    },
];

/**
 * Default income categories
 */
export const defaultIncomeCategories: CreateCategoryDTO[] = [
    {
        name: 'Salaire',
        type: CategoryType.INCOME,
        icon: 'cash',
        color: '#66BB6A',
    },
];

/**
 * All default categories combined
 */
export const defaultCategories: CreateCategoryDTO[] = [
    ...defaultExpenseCategories,
    ...defaultIncomeCategories,
];
