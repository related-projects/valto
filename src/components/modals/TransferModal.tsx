import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Wallet } from '../../domain/entities';
import { useFormatting } from '../../hooks/useFormatting';
import { useWallets } from '../../hooks/useWallets';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/theme';
import { typography } from '../../theme/typography';

interface TransferModalProps {
    visible: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.7;

export const TransferModal: React.FC<TransferModalProps> = ({ visible, onClose, onSuccess }) => {
    const { colors, spacing, typography, radius } = useTheme();
    const { t } = useTranslation();
    const { formatAmount } = useFormatting();

    // Hooks
    const { wallets, refreshWallets, transferBetweenWallets } = useWallets();

    // Form state
    const [sourceWalletId, setSourceWalletId] = useState<string>('');
    const [destWalletId, setDestWalletId] = useState<string>('');
    const [amount, setAmount] = useState('');
    const [showSourcePicker, setShowSourcePicker] = useState(false);
    const [showDestPicker, setShowDestPicker] = useState(false);
    const [transferring, setTransferring] = useState(false);

    // Get selected wallets
    const sourceWallet = wallets.find(w => w.id === sourceWalletId);
    const destWallet = wallets.find(w => w.id === destWalletId);

    // Available destination wallets (exclude source)
    const availableDestWallets = wallets.filter(w => w.id !== sourceWalletId);

    // Refresh wallets when modal becomes visible
    useEffect(() => {
        if (visible) {
            refreshWallets();
        }
    }, [visible, refreshWallets]);

    // Initialize default selections when wallets load
    useEffect(() => {
        if (wallets.length > 0 && !sourceWalletId) {
            setSourceWalletId(wallets[0].id);
            if (wallets.length > 1) {
                setDestWalletId(wallets[1].id);
            }
        }
    }, [wallets, sourceWalletId]);

    // Reset dest if it matches new source
    useEffect(() => {
        if (destWalletId === sourceWalletId && wallets.length > 1) {
            const newDest = wallets.find(w => w.id !== sourceWalletId);
            if (newDest) {
                setDestWalletId(newDest.id);
            }
        }
    }, [sourceWalletId, destWalletId, wallets]);

    const resetForm = () => {
        setAmount('');
        setShowSourcePicker(false);
        setShowDestPicker(false);
    };

    const handleTransfer = async () => {
        // Convert to cents
        const parsedAmount = parseFloat(amount);
        const amountNum = Math.round(parsedAmount * 100);

        if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
            Alert.alert(t('modals.transfer.invalidAmount'), t('modals.transfer.invalidAmountMessage'));
            return;
        }

        if (!sourceWalletId) {
            Alert.alert(t('modals.transfer.noSourceWallet'), t('modals.transfer.noSourceWalletMessage'));
            return;
        }

        if (!destWalletId) {
            Alert.alert(t('modals.transfer.noDestWallet'), t('modals.transfer.noDestWalletMessage'));
            return;
        }

        if (sourceWalletId === destWalletId) {
            Alert.alert(t('modals.transfer.invalidTransfer'), t('modals.transfer.invalidTransferMessage'));
            return;
        }

        if (sourceWallet && amountNum > sourceWallet.balance) {
            Alert.alert(t('modals.transfer.insufficientBalance'), t('modals.transfer.insufficientBalanceMessage', { amount: formatAmount(sourceWallet.balance) }));
            return;
        }

        try {
            setTransferring(true);

            await transferBetweenWallets(sourceWalletId, destWalletId, amountNum);

            resetForm();
            onSuccess?.();
            onClose();
        } catch (error) {
            Alert.alert(
                t('modals.transfer.error'),
                error instanceof Error ? error.message : t('modals.transfer.transferFailed')
            );
        } finally {
            setTransferring(false);
        }
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const renderWalletOption = (wallet: Wallet, isSelected: boolean, onSelect: () => void) => (
        <TouchableOpacity
            key={wallet.id}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                backgroundColor: isSelected ? colors.muted : 'transparent',
            }}
            onPress={onSelect}
        >
            <Ionicons
                name="wallet-outline"
                size={20}
                color={wallet.color || colors.primary}
                style={{ marginRight: spacing.sm }}
            />
            <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>
                    {wallet.name}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                    {formatAmount(wallet.balance)}
                </Text>
            </View>
            {isSelected && (
                <Ionicons name="checkmark" size={20} color={colors.accent} />
            )}
        </TouchableOpacity>
    );

    // Check if transfer is possible
    const canTransfer = wallets.length >= 2;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={handleClose}
        >
            <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
                <TouchableOpacity
                    style={styles.overlayTouchable}
                    activeOpacity={1}
                    onPress={handleClose}
                />
                <View style={[styles.modalContainer, { backgroundColor: colors.card, height: MODAL_HEIGHT }]}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
                            <Ionicons name="close" size={24} color={colors.foreground} />
                        </TouchableOpacity>
                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                            {t('modals.transfer.title')}
                        </Text>
                        <TouchableOpacity
                            onPress={handleTransfer}
                            style={styles.headerButton}
                            disabled={transferring || !canTransfer}
                        >
                            {transferring ? (
                                <ActivityIndicator size="small" color={colors.accent} />
                            ) : (
                                <Text style={{
                                    color: canTransfer ? colors.accent : colors.mutedForeground,
                                    fontSize: typography.sizes.md,
                                    fontWeight: typography.weights.semibold
                                }}>
                                    {t('modals.transfer.send')}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ flex: 1 }}
                    >
                        <ScrollView
                            style={styles.scrollContent}
                            contentContainerStyle={[styles.scrollContentContainer, { paddingBottom: spacing.tabBarOffset }]}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {!canTransfer ? (
                                <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                                    <Ionicons name="wallet-outline" size={48} color={colors.mutedForeground} style={{ marginBottom: spacing.md }} />
                                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.md, textAlign: 'center' }}>
                                        {t('modals.transfer.needTwoWallets')}
                                    </Text>
                                </View>
                            ) : (
                                <>
                                    {/* Source Wallet */}
                                    <View style={{ marginBottom: spacing.lg }}>
                                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                            {t('modals.transfer.from')}
                                        </Text>
                                        <TouchableOpacity
                                            style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}
                                            onPress={() => {
                                                setShowSourcePicker(!showSourcePicker);
                                                setShowDestPicker(false);
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                                <Ionicons name="wallet-outline" size={20} color={sourceWallet?.color || colors.primary} style={{ marginRight: spacing.sm }} />
                                                <View>
                                                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>
                                                        {sourceWallet?.name || t('modals.transfer.selectWallet')}
                                                    </Text>
                                                    {sourceWallet && (
                                                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                                                            {t('modals.transfer.balance', { amount: formatAmount(sourceWallet.balance) })}
                                                        </Text>
                                                    )}
                                                </View>
                                            </View>
                                            <Ionicons name={showSourcePicker ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
                                        </TouchableOpacity>
                                        {showSourcePicker && (
                                            <View style={{
                                                backgroundColor: colors.card,
                                                borderRadius: radius.md,
                                                borderWidth: 1,
                                                borderColor: colors.border,
                                                marginTop: spacing.xs,
                                                maxHeight: 200,
                                            }}>
                                                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                                    {wallets.map((wallet) => renderWalletOption(
                                                        wallet,
                                                        sourceWalletId === wallet.id,
                                                        () => {
                                                            setSourceWalletId(wallet.id);
                                                            setShowSourcePicker(false);
                                                        }
                                                    ))}
                                                </ScrollView>
                                            </View>
                                        )}
                                    </View>

                                    {/* Transfer Arrow */}
                                    <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
                                        <View style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 20,
                                            backgroundColor: colors.accent + '20',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}>
                                            <Ionicons name="arrow-down" size={20} color={colors.accent} />
                                        </View>
                                    </View>

                                    {/* Destination Wallet */}
                                    <View style={{ marginBottom: spacing.lg }}>
                                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                            {t('modals.transfer.to')}
                                        </Text>
                                        <TouchableOpacity
                                            style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}
                                            onPress={() => {
                                                setShowDestPicker(!showDestPicker);
                                                setShowSourcePicker(false);
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                                <Ionicons name="wallet-outline" size={20} color={destWallet?.color || colors.primary} style={{ marginRight: spacing.sm }} />
                                                <View>
                                                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.md }}>
                                                        {destWallet?.name || t('modals.transfer.selectWallet')}
                                                    </Text>
                                                    {destWallet && (
                                                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.xs }}>
                                                            {t('modals.transfer.balance', { amount: formatAmount(destWallet.balance) })}
                                                        </Text>
                                                    )}
                                                </View>
                                            </View>
                                            <Ionicons name={showDestPicker ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
                                        </TouchableOpacity>
                                        {showDestPicker && (
                                            <View style={{
                                                backgroundColor: colors.card,
                                                borderRadius: radius.md,
                                                borderWidth: 1,
                                                borderColor: colors.border,
                                                marginTop: spacing.xs,
                                                maxHeight: 200,
                                            }}>
                                                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                                    {availableDestWallets.length === 0 ? (
                                                        <View style={{ padding: spacing.md, alignItems: 'center' }}>
                                                            <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                                                                {t('modals.transfer.noOtherWallets')}
                                                            </Text>
                                                        </View>
                                                    ) : (
                                                        availableDestWallets.map((wallet) => renderWalletOption(
                                                            wallet,
                                                            destWalletId === wallet.id,
                                                            () => {
                                                                setDestWalletId(wallet.id);
                                                                setShowDestPicker(false);
                                                            }
                                                        ))
                                                    )}
                                                </ScrollView>
                                            </View>
                                        )}
                                    </View>

                                    {/* Amount */}
                                    <View style={{ marginBottom: spacing.xl }}>
                                        <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                            {t('modals.transfer.amount')}
                                        </Text>
                                        <View style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                            <Text style={{ color: colors.foreground, fontSize: typography.sizes.lg, marginRight: spacing.sm }}>$</Text>
                                            <TextInput
                                                style={[styles.input, { color: colors.foreground }]}
                                                placeholder="0.00"
                                                placeholderTextColor={colors.mutedForeground}
                                                keyboardType="decimal-pad"
                                                value={amount}
                                                onChangeText={setAmount}
                                            />
                                        </View>
                                        {sourceWallet && (
                                            <Text style={{
                                                color: colors.mutedForeground,
                                                fontSize: typography.sizes.xs,
                                                marginTop: spacing.xs
                                            }}>
                                                {t('modals.transfer.available', { amount: formatAmount(sourceWallet.balance) })}
                                            </Text>
                                        )}
                                    </View>
                                </>
                            )}
                        </ScrollView>
                    </KeyboardAvoidingView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    overlayTouchable: {
        flex: 1,
    },
    modalContainer: {
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
    },
    headerButton: {
        padding: spacing.xs,
    },
    scrollContent: {
        flex: 1,
    },
    scrollContentContainer: {
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.xl,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius.md,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: 14,
    },
    input: {
        flex: 1,
        fontSize: typography.sizes.md,
    },
});
