/**
 * Seed Data Definitions
 * 
 * Default wallets and categories for new installations.
 * These match the structure of the existing mock data to ensure consistency.
 * 
 * Architecture Note:
 * This data is only used for initial setup. Once the user has data in storage,
 * these defaults are never applied again.
 */

import { CategoryType, CreateCategoryDTO } from '../../domain/entities/Category';
import { CreateWalletDTO, WalletType } from '../../domain/entities/Wallet';

/**
 * Default wallets for new users
 */
export const defaultWallets: CreateWalletDTO[] = [
    {
        name: 'Cash',
        balance: 0,
        type: WalletType.CASH,
        color: '#5D6D7E',
    },
    {
        name: 'Bank Account',
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
        name: 'Savings',
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
        name: 'Food & Dining',
        type: CategoryType.EXPENSE,
        icon: 'restaurant',
        color: '#FFB74D',
    },
    {
        name: 'Shopping',
        type: CategoryType.EXPENSE,
        icon: 'cart',
        color: '#E57373',
    },
    {
        name: 'Transport',
        type: CategoryType.EXPENSE,
        icon: 'car',
        color: '#64B5F6',
    },
    {
        name: 'Entertainment',
        type: CategoryType.EXPENSE,
        icon: 'film-outline',
        color: '#4DD0E1',
    },
    {
        name: 'Utilities',
        type: CategoryType.EXPENSE,
        icon: 'flash',
        color: '#BA68C8',
    },
    {
        name: 'Healthcare',
        type: CategoryType.EXPENSE,
        icon: 'medical',
        color: '#81C784',
    },
    {
        name: 'Education',
        type: CategoryType.EXPENSE,
        icon: 'school',
        color: '#9575CD',
    },
    {
        name: 'Personal Care',
        type: CategoryType.EXPENSE,
        icon: 'person',
        color: '#F06292',
    },
    {
        name: 'Housing',
        type: CategoryType.EXPENSE,
        icon: 'home',
        color: '#A1887F',
    },
    {
        name: 'Other',
        type: CategoryType.EXPENSE,
        icon: 'ellipsis-horizontal',
        color: '#90A4AE',
    },
];

/**
 * Default income categories
 */
export const defaultIncomeCategories: CreateCategoryDTO[] = [
    {
        name: 'Salary',
        type: CategoryType.INCOME,
        icon: 'cash',
        color: '#66BB6A',
    },
    {
        name: 'Freelance',
        type: CategoryType.INCOME,
        icon: 'briefcase',
        color: '#42A5F5',
    },
    {
        name: 'Investment',
        type: CategoryType.INCOME,
        icon: 'trending-up',
        color: '#26A69A',
    },
    {
        name: 'Business',
        type: CategoryType.INCOME,
        icon: 'business',
        color: '#FFA726',
    },
    {
        name: 'Gift',
        type: CategoryType.INCOME,
        icon: 'gift',
        color: '#EC407A',
    },
    {
        name: 'Other',
        type: CategoryType.INCOME,
        icon: 'ellipsis-horizontal',
        color: '#78909C',
    },
];

/**
 * All default categories combined
 */
export const defaultCategories: CreateCategoryDTO[] = [
    ...defaultExpenseCategories,
    ...defaultIncomeCategories,
];
