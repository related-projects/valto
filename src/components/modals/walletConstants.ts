/**
 * Wallet Modal Constants
 *
 * Shared constants used by AddWalletModal and EditWalletModal.
 * Extracted to avoid duplication.
 */

import { Ionicons } from '@expo/vector-icons';
import { WalletType } from '../../domain/entities';

/** Predefined color palette for wallet selection */
export const WALLET_COLORS = [
    '#6366F1', // Indigo
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#EF4444', // Red
    '#F97316', // Orange
    '#EAB308', // Yellow
    '#22C55E', // Green
    '#14B8A6', // Teal
    '#06B6D4', // Cyan
    '#3B82F6', // Blue
];

/** Wallet type options for selection — labelKey maps to wallets.type.* in locale */
export const WALLET_TYPES: { labelKey: string; value: WalletType; icon: keyof typeof Ionicons.glyphMap }[] = [
    { labelKey: 'cash', value: WalletType.CASH, icon: 'wallet-outline' },
    { labelKey: 'bank', value: WalletType.BANK, icon: 'card-outline' },
    { labelKey: 'mobile', value: WalletType.MOBILE, icon: 'phone-portrait-outline' },
    { labelKey: 'savings', value: WalletType.SAVINGS, icon: 'cash-outline' },
];
