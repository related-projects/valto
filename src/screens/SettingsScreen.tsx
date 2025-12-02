import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListItem } from '../components/ui/ListItem';
import { SectionHeader } from '../components/ui/SectionHeader';
import { useTheme } from '../theme/theme';

export const SettingsScreen = () => {
    const { colors, spacing, typography } = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={{
                paddingTop: insets.top + spacing.md,
                paddingBottom: spacing['3xl'],
                paddingHorizontal: spacing.md,
            }}
        >
            <Text
                style={{
                    color: colors.foreground,
                    fontSize: typography.sizes['2xl'],
                    fontWeight: 'bold',
                    marginBottom: spacing.lg,
                }}
            >
                Settings
            </Text>

            {/* User Info Card */}
            <View style={{
                backgroundColor: colors.card,
                borderRadius: 16,
                padding: spacing.md,
                marginBottom: spacing.lg,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 3,
                flexDirection: 'row',
                alignItems: 'center',
            }}>
                <View style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: spacing.md,
                }}>
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>V</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontSize: typography.sizes.md, fontWeight: '600' }}>
                        Valto User
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.sm }}>
                        Premium Account
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
            </View>

            {/* References */}
            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title="References" />
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    paddingHorizontal: spacing.md,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 8,
                    elevation: 3,
                }}>
                    <ListItem
                        title="Currency"
                        subtitle="USD ($)"
                        leftIcon={
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(139, 92, 72, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="cash-outline" size={20} color={colors.primary} />
                            </View>
                        }
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Language"
                        subtitle="English"
                        leftIcon={
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(139, 92, 72, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="language-outline" size={20} color={colors.primary} />
                            </View>
                        }
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Theme"
                        subtitle="System"
                        leftIcon={
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(139, 92, 72, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="color-palette-outline" size={20} color={colors.primary} />
                            </View>
                        }
                        showChevron
                        onPress={() => { }}
                    />
                </View>
            </View>

            {/* App Settings */}
            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title="App Settings" />
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    paddingHorizontal: spacing.md,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 8,
                    elevation: 3,
                }}>
                    <ListItem
                        title="Categories"
                        leftIcon={
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(139, 92, 72, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="grid-outline" size={20} color={colors.primary} />
                            </View>
                        }
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Notifications"
                        leftIcon={
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(139, 92, 72, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="notifications-outline" size={20} color={colors.primary} />
                            </View>
                        }
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Securities"
                        subtitle="PIN enabled"
                        leftIcon={
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(139, 92, 72, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
                            </View>
                        }
                        showChevron
                        onPress={() => { }}
                    />
                </View>
            </View>

            {/* Data */}
            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title="Data" />
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    paddingHorizontal: spacing.md,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 8,
                    elevation: 3,
                }}>
                    <ListItem
                        title="Backup Data"
                        leftIcon={
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(139, 92, 72, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
                            </View>
                        }
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Restore Data"
                        leftIcon={
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(139, 92, 72, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="cloud-download-outline" size={20} color={colors.primary} />
                            </View>
                        }
                        showChevron
                        onPress={() => { }}
                    />
                </View>
            </View>

            {/* Support */}
            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title="Support" />
                <View style={{
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    paddingHorizontal: spacing.md,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 8,
                    elevation: 3,
                }}>
                    <ListItem
                        title="Help & FAQ"
                        leftIcon={
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(139, 92, 72, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="help-circle-outline" size={20} color={colors.primary} />
                            </View>
                        }
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="About Valto"
                        subtitle="1.0.0"
                        leftIcon={
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(139, 92, 72, 0.1)', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
                            </View>
                        }
                        showChevron
                        onPress={() => { }}
                    />
                </View>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
