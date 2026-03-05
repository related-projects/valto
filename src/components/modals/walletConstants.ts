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

/** Wallet type options for selection */
export const WALLET_TYPES: { label: string; value: WalletType; icon: keyof typeof Ionicons.glyphMap }[] = [
    { label: 'Cash', value: WalletType.CASH, icon: 'wallet-outline' },
    { label: 'Bank', value: WalletType.BANK, icon: 'card-outline' },
    { label: 'Mobile', value: WalletType.MOBILE, icon: 'phone-portrait-outline' },
    { label: 'Savings', value: WalletType.SAVINGS, icon: 'cash-outline' },
];
