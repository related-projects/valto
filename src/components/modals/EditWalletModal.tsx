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
import { Wallet, WalletType } from '../../domain/entities';
import { useWallets } from '../../hooks/useWallets';
import { normalizeAmount } from '../../utils/normalizeAmount';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/theme';
import { typography } from '../../theme/typography';
import { WALLET_COLORS, WALLET_TYPES } from './walletConstants';

interface EditWalletModalProps {
    visible: boolean;
    wallet: Wallet | null;
    onClose: () => void;
    onSuccess?: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.75;

export const EditWalletModal: React.FC<EditWalletModalProps> = ({ visible, wallet, onClose, onSuccess }) => {
    const { colors, spacing, typography, radius } = useTheme();
    const { t } = useTranslation();

    // Hooks
    const { updateWallet, deleteWallet, hasTransactions } = useWallets();

    // Form state
    const [name, setName] = useState('');
    const [balance, setBalance] = useState('');
    const [walletType, setWalletType] = useState<WalletType>(WalletType.CASH);
    const [selectedColor, setSelectedColor] = useState(WALLET_COLORS[0]);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Initialize form when wallet changes
    useEffect(() => {
        if (wallet) {
            setName(wallet.name);
            // Display balance in major units (dollars) for user editing
            setBalance((wallet.balance / 100).toString());
            setWalletType(wallet.type);
            setSelectedColor(wallet.color || WALLET_COLORS[0]);
        }
    }, [wallet]);

    const handleSave = async () => {
        if (!wallet) return;

        // Validation
        if (!name.trim()) {
            Alert.alert(t('modals.addWallet.invalidName'), t('modals.addWallet.invalidNameMessage'));
            return;
        }

        const balanceNum = balance ? parseFloat(balance) : 0;

        if (isNaN(balanceNum) || balanceNum < 0) {
            Alert.alert(t('modals.addWallet.invalidBalance'), t('modals.addWallet.invalidBalanceMessage'));
            return;
        }

        // Single input→storage conversion point (major units → integer cents).
        const balanceMinor = normalizeAmount(balanceNum);

        try {
            setSaving(true);

            await updateWallet({
                id: wallet.id,
                name: name.trim(),
                balance: balanceMinor,
                type: walletType,
                color: selectedColor,
            });

            onSuccess?.();
            onClose();
        } catch (error) {
            Alert.alert(
                t('modals.addWallet.error'),
                error instanceof Error ? error.message : t('modals.addWallet.createFailed')
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!wallet) return;

        try {
            // Check if wallet has transactions
            const hasTxns = await hasTransactions(wallet.id);

            if (hasTxns) {
                Alert.alert(
                    t('modals.editWallet.hasTransactionsTitle'),
                    t('modals.editWallet.hasTransactionsMessage'),
                    [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                            text: t('modals.editWallet.deleteAnyway'),
                            style: 'destructive',
                            onPress: () => performDelete(),
                        },
                    ]
                );
            } else {
                Alert.alert(
                    t('modals.editWallet.deleteTitle'),
                    t('modals.editWallet.deleteMessage', { name: wallet.name }),
                    [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                            text: t('common.delete'),
                            style: 'destructive',
                            onPress: () => performDelete(),
                        },
                    ]
                );
            }
        } catch (error) {
            Alert.alert(t('modals.editWallet.error'), t('modals.editWallet.deleteFailed'));
        }
    };

    const performDelete = async () => {
        if (!wallet) return;

        try {
            setDeleting(true);
            await deleteWallet(wallet.id);
            onSuccess?.();
            onClose();
        } catch (error) {
            Alert.alert(
                t('modals.addWallet.error'),
                error instanceof Error ? error.message : t('modals.editWallet.deleteFailed')
            );
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
                <TouchableOpacity
                    style={styles.overlayTouchable}
                    activeOpacity={1}
                    onPress={onClose}
                />
                <View style={[styles.modalContainer, { backgroundColor: colors.card, height: MODAL_HEIGHT }]}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                            <Ionicons name="close" size={24} color={colors.foreground} />
                        </TouchableOpacity>
                        <Text style={{ color: colors.foreground, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                            {t('modals.editWallet.title')}
                        </Text>
                        <TouchableOpacity onPress={handleSave} style={styles.headerButton} disabled={saving}>
                            {saving ? (
                                <ActivityIndicator size="small" color={colors.accent} />
                            ) : (
                                <Text style={{ color: colors.accent, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold }}>
                                    {t('modals.editWallet.save')}
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
                            {/* Wallet Name */}
                            <View style={{ marginBottom: spacing.lg }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                    {t('modals.addWallet.walletName')}
                                </Text>
                                <View style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                    <TextInput
                                        style={[styles.input, { color: colors.foreground }]}
                                        placeholder={t('modals.addWallet.walletNamePlaceholder')}
                                        placeholderTextColor={colors.mutedForeground}
                                        value={name}
                                        onChangeText={setName}
                                        autoCapitalize="words"
                                    />
                                </View>
                            </View>

                            {/* Balance */}
                            <View style={{ marginBottom: spacing.lg }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
                                    {t('modals.addWallet.initialBalance')}
                                </Text>
                                <View style={[styles.inputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.lg, marginRight: spacing.sm }}>$</Text>
                                    <TextInput
                                        style={[styles.input, { color: colors.foreground }]}
                                        placeholder="0.00"
                                        placeholderTextColor={colors.mutedForeground}
                                        keyboardType="decimal-pad"
                                        value={balance}
                                        onChangeText={setBalance}
                                    />
                                </View>
                            </View>

                            {/* Wallet Type */}
                            <View style={{ marginBottom: spacing.lg }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.sm }}>
                                    {t('modals.addWallet.walletType')}
                                </Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                                    {WALLET_TYPES.map((type) => {
                                        const isSelected = walletType === type.value;
                                        return (
                                            <TouchableOpacity
                                                key={type.value}
                                                style={[
                                                    styles.typeButton,
                                                    {
                                                        backgroundColor: isSelected ? colors.accent : colors.background,
                                                        borderColor: isSelected ? colors.accent : colors.border,
                                                        borderRadius: radius.md,
                                                    },
                                                ]}
                                                onPress={() => setWalletType(type.value)}
                                            >
                                                <Ionicons
                                                    name={type.icon}
                                                    size={18}
                                                    color={isSelected ? colors.accentForeground : colors.foreground}
                                                    style={{ marginRight: spacing.xs }}
                                                />
                                                <Text
                                                    style={{
                                                        color: isSelected ? colors.accentForeground : colors.foreground,
                                                        fontSize: typography.sizes.sm,
                                                        fontWeight: isSelected ? '600' : '500',
                                                    }}
                                                >
                                                    {t(`wallets.type.${type.labelKey}`)}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            {/* Color Picker */}
                            <View style={{ marginBottom: spacing.xl }}>
                                <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm, marginBottom: spacing.sm }}>
                                    {t('modals.addWallet.walletColor')}
                                </Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                                    {WALLET_COLORS.map((color) => {
                                        const isSelected = selectedColor === color;
                                        return (
                                            <TouchableOpacity
                                                key={color}
                                                style={[
                                                    styles.colorButton,
                                                    {
                                                        backgroundColor: color,
                                                        borderWidth: isSelected ? 3 : 0,
                                                        borderColor: colors.foreground,
                                                    },
                                                ]}
                                                onPress={() => setSelectedColor(color)}
                                            >
                                                {isSelected && (
                                                    <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            {/* Delete Button */}
                            <TouchableOpacity
                                style={[
                                    styles.deleteButton,
                                    {
                                        backgroundColor: colors.destructive + '15',
                                        borderColor: colors.destructive,
                                        borderRadius: radius.md,
                                    },
                                ]}
                                onPress={handleDelete}
                                disabled={deleting}
                            >
                                {deleting ? (
                                    <ActivityIndicator size="small" color={colors.destructive} />
                                ) : (
                                    <>
                                        <Ionicons name="trash-outline" size={18} color={colors.destructive} style={{ marginRight: spacing.xs }} />
                                        <Text style={{ color: colors.destructive, fontSize: typography.sizes.md, fontWeight: '600' }}>
                                            {t('modals.editWallet.delete')}
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
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
    typeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderWidth: 1,
    },
    colorButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.md,
        borderWidth: 1,
    },
});
