/**
 * Seed Data Definitions
 *
 * Default categories for new installations.
 *
 * No wallets are seeded. Onboarding is the single source of the first wallet:
 * it cannot be skipped, and the user names, types and funds that wallet itself,
 * so a fresh install ends with exactly one wallet - theirs.
 *
 * Architecture Note:
 * This data is only used for initial setup. Once the user has data in storage,
 * these defaults are never applied again.
 *
 * Why the labels below are plain French literals and not i18n keys:
 * categories are USER DATA, not UI strings. A user can add their own categories,
 * and can rename any default into any language - including one the app does not
 * ship a translation for. Running these labels through i18n would fight that:
 * translated defaults would sit inconsistently next to untranslated user entries,
 * and a re-translation would overwrite a name the user deliberately chose. So the
 * app writes an initial label once, at install time, and never re-translates it.
 */

import { CategoryType, CreateCategoryDTO } from '../../domain/entities/Category';

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
