import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/ui/Avatar';
import { IconBadge } from '../components/ui/IconBadge';
import { ListItem } from '../components/ui/ListItem';
import { SectionHeader } from '../components/ui/SectionHeader';
import { useTheme } from '../theme/theme';

export const SettingsScreen = () => {
    const { colors, spacing, typography, radius, shadows } = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={{
                paddingTop: insets.top + spacing.md,
                paddingBottom: spacing.tabBarOffset,
                paddingHorizontal: spacing.md,
            }}
            showsVerticalScrollIndicator={false}
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
                borderRadius: radius.lg,
                padding: spacing.md,
                marginBottom: spacing.lg,
                ...shadows.card,
                flexDirection: 'row',
                alignItems: 'center',
            }}>
                <Avatar label="V" size="md" />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
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
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    ...shadows.card,
                }}>
                    <ListItem
                        title="Currency"
                        subtitle="USD ($)"
                        leftIcon={
                            <IconBadge icon={<Ionicons name="cash-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Language"
                        subtitle="English"
                        leftIcon={
                            <IconBadge icon={<Ionicons name="language-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Theme"
                        subtitle="System"
                        leftIcon={
                            <IconBadge icon={<Ionicons name="color-palette-outline" size={20} color={colors.primary} />} />
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
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    ...shadows.card,
                }}>
                    <ListItem
                        title="Categories"
                        leftIcon={
                            <IconBadge icon={<Ionicons name="grid-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Notifications"
                        leftIcon={
                            <IconBadge icon={<Ionicons name="notifications-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Securities"
                        subtitle="PIN enabled"
                        leftIcon={
                            <IconBadge icon={<Ionicons name="lock-closed-outline" size={20} color={colors.primary} />} />
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
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    ...shadows.card,
                }}>
                    <ListItem
                        title="Backup Data"
                        leftIcon={
                            <IconBadge icon={<Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Restore Data"
                        leftIcon={
                            <IconBadge icon={<Ionicons name="cloud-download-outline" size={20} color={colors.primary} />} />
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
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md,
                    ...shadows.card,
                }}>
                    <ListItem
                        title="Help & FAQ"
                        leftIcon={
                            <IconBadge icon={<Ionicons name="help-circle-outline" size={20} color={colors.primary} />} />
                        }
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="About Valto"
                        subtitle="1.0.0"
                        leftIcon={
                            <IconBadge icon={<Ionicons name="information-circle-outline" size={20} color={colors.primary} />} />
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
