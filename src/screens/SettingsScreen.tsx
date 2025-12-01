import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
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

            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title="Preferences" />
                <View style={{ backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: spacing.md }}>
                    <ListItem
                        title="Dark Mode"
                        leftIcon={<Ionicons name="moon-outline" size={22} color={colors.foreground} />}
                        rightIcon={<Switch value={false} onValueChange={() => { }} />}
                        showChevron={false}
                    />
                    <ListItem
                        title="Notifications"
                        leftIcon={<Ionicons name="notifications-outline" size={22} color={colors.foreground} />}
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Currency"
                        subtitle="USD ($)"
                        leftIcon={<Ionicons name="cash-outline" size={22} color={colors.foreground} />}
                        showChevron
                        onPress={() => { }}
                        style={{ borderBottomWidth: 0 }}
                    />
                </View>
            </View>

            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title="Account" />
                <View style={{ backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: spacing.md }}>
                    <ListItem
                        title="Profile"
                        leftIcon={<Ionicons name="person-outline" size={22} color={colors.foreground} />}
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Security"
                        leftIcon={<Ionicons name="lock-closed-outline" size={22} color={colors.foreground} />}
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="Data & Privacy"
                        leftIcon={<Ionicons name="shield-checkmark-outline" size={22} color={colors.foreground} />}
                        showChevron
                        onPress={() => { }}
                        style={{ borderBottomWidth: 0 }}
                    />
                </View>
            </View>

            <View style={{ marginBottom: spacing.xl }}>
                <SectionHeader title="Support" />
                <View style={{ backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: spacing.md }}>
                    <ListItem
                        title="Help Center"
                        leftIcon={<Ionicons name="help-circle-outline" size={22} color={colors.foreground} />}
                        showChevron
                        onPress={() => { }}
                    />
                    <ListItem
                        title="About Valto"
                        leftIcon={<Ionicons name="information-circle-outline" size={22} color={colors.foreground} />}
                        showChevron
                        onPress={() => { }}
                        style={{ borderBottomWidth: 0 }}
                    />
                </View>
            </View>

            <Text style={{ textAlign: 'center', color: colors.mutedForeground, marginTop: spacing.lg }}>
                Version 1.0.0
            </Text>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
