/**
 * Seed Data Definitions
 *
 * Default categories for new installations.
 *
 * No wallets are seeded on first launch. Onboarding is the single source of the
 * first wallet there: it cannot be skipped, and the user names, types and funds
 * that wallet itself, so a fresh install ends with exactly one wallet - theirs.
 *
 * `resetDefaultWallet` below is the one exception, and it is NOT part of
 * initializeSeedData. The full data reset runs on an install that is already
 * past onboarding and will not see it again, so deleting the last wallet there
 * would leave an app in which no expense can be recorded at all. That path
 * creates this one empty wallet instead. First launch is untouched.
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
import { CreateWalletDTO, WalletType } from '../../domain/entities/Wallet';

/**
 * The single wallet the full data reset leaves behind, empty.
 *
 * Zero balance, so it anchors a ledger that starts from nothing: the reset
 * deletes every transaction, and a non-zero opening balance would assert an
 * amount the user never entered. The label is a plain literal for the same
 * reason the category labels below are - it is user data, written once, and the
 * user renames it if they want another name.
 */
export const resetDefaultWallet: CreateWalletDTO = {
    name: 'Portefeuille',
    balance: 0,
    type: WalletType.CASH,
    color: '#4DB6AC',
};

/**
 * Default expense categories
 *
 * One line per recurring household commitment, so a user whose paper budget is
 * an envelope split finds a ready-made line for each envelope and does not have
 * to reach for the wallet as the only object that accepts an amount.
 *
 * Icons and colours are drawn from the sets the category editor already offers
 * (ICONS / COLORS in src/components/modals/CategoryModal.tsx), so a default
 * category is visually indistinguishable from one the user creates themselves.
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
    {
        name: 'Logement',
        type: CategoryType.EXPENSE,
        icon: 'home',
        color: '#A1887F',
    },
    {
        name: 'Eau et électricité',
        type: CategoryType.EXPENSE,
        icon: 'flash',
        color: '#4DD0E1',
    },
    {
        name: 'Téléphone et Internet',
        type: CategoryType.EXPENSE,
        icon: 'business',
        color: '#42A5F5',
    },
    {
        name: 'Santé',
        type: CategoryType.EXPENSE,
        icon: 'medical',
        color: '#26A69A',
    },
    {
        name: 'Aide famille',
        type: CategoryType.EXPENSE,
        icon: 'person',
        color: '#F06292',
    },
    {
        name: 'Loisirs',
        type: CategoryType.EXPENSE,
        icon: 'film-outline',
        color: '#BA68C8',
    },
    {
        name: 'Imprévus',
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
        name: 'Salaire',
        type: CategoryType.INCOME,
        icon: 'cash',
        color: '#66BB6A',
    },
    {
        name: 'Freelance',
        type: CategoryType.INCOME,
        icon: 'briefcase',
        color: '#81C784',
    },
    {
        name: 'Autre',
        type: CategoryType.INCOME,
        icon: 'trending-up',
        color: '#9575CD',
    },
];

/**
 * All default categories combined
 */
export const defaultCategories: CreateCategoryDTO[] = [
    ...defaultExpenseCategories,
    ...defaultIncomeCategories,
];
