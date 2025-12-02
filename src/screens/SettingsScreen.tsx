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
                borderRadius: 12,
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
                    backgroundColor: colors.primary,
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
                        leftIcon={<Ionicons name="cash-outline" size={22} color={colors.foreground} />}
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Language"
                        subtitle="English"
                        leftIcon={<Ionicons name="language-outline" size={22} color={colors.foreground} />}
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Theme"
                        subtitle="System"
                        leftIcon={<Ionicons name="color-palette-outline" size={22} color={colors.foreground} />}
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
                        leftIcon={<Ionicons name="grid-outline" size={22} color={colors.foreground} />}
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Notifications"
                        leftIcon={<Ionicons name="notifications-outline" size={22} color={colors.foreground} />}
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Securities"
                        subtitle="PIN enabled"
                        leftIcon={<Ionicons name="lock-closed-outline" size={22} color={colors.foreground} />}
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
                        leftIcon={<Ionicons name="cloud-upload-outline" size={22} color={colors.foreground} />}
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Restore Data"
                        leftIcon={<Ionicons name="cloud-download-outline" size={22} color={colors.foreground} />}
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
                        leftIcon={<Ionicons name="help-circle-outline" size={22} color={colors.foreground} />}
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="About Valto"
                        subtitle="1.0.0"
                        leftIcon={<Ionicons name="information-circle-outline" size={22} color={colors.foreground} />}
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
