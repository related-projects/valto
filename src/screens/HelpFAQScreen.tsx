/**
 * Help & FAQ Screen
 *
 * Displays expandable/collapsible FAQ items.
 * Fully offline — uses static data from domain constants.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    LayoutAnimation,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FAQ_DATA, type FAQItem } from '../domain/constants/faqData';
import { useTheme } from '../theme/theme';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── FAQ Item Component ───────────────────────────────────────────────

interface FAQItemCardProps {
    item: FAQItem;
    expanded: boolean;
    onToggle: () => void;
}

const FAQItemCard: React.FC<FAQItemCardProps> = React.memo(({ item, expanded, onToggle }) => {
    const { colors, spacing, typography, radius, shadows } = useTheme();

    return (
        <TouchableOpacity
            style={[
                styles.faqCard,
                {
                    backgroundColor: colors.card,
                    borderRadius: radius.md,
                    padding: spacing.md,
                    marginBottom: spacing.sm,
                    ...shadows.card,
                },
            ]}
            onPress={onToggle}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={item.question}
            accessibilityHint={expanded ? 'Tap to collapse answer' : 'Tap to expand answer'}
            accessibilityState={{ expanded }}
        >
            <View style={styles.questionRow}>
                <Text
                    style={[
                        styles.questionText,
                        {
                            color: colors.foreground,
                            fontSize: typography.sizes.md,
                        },
                    ]}
                >
                    {item.question}
                </Text>
                <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.mutedForeground}
                />
            </View>

            {expanded && (
                <Text
                    style={{
                        color: colors.mutedForeground,
                        fontSize: typography.sizes.sm,
                        lineHeight: 20,
                        marginTop: spacing.sm,
                    }}
                >
                    {item.answer}
                </Text>
            )}
        </TouchableOpacity>
    );
});

// ─── Screen ───────────────────────────────────────────────────────────

export const HelpFAQScreen = () => {
    const { t } = useTranslation();
    const { colors, spacing, typography } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const handleToggle = useCallback((id: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedId(prev => (prev === id ? null : id));
    }, []);

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
            {/* Header */}
            <View style={styles.headerRow}>
                <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.foreground} />
                </TouchableOpacity>
                <Text
                    style={{
                        color: colors.foreground,
                        fontSize: typography.sizes['2xl'],
                        fontWeight: 'bold',
                        marginLeft: spacing.sm,
                    }}
                >
                    {t('help.title')}
                </Text>
            </View>

            <Text
                style={{
                    color: colors.mutedForeground,
                    fontSize: typography.sizes.sm,
                    marginBottom: spacing.lg,
                }}
            >
                {t('help.subtitle')}
            </Text>

            {/* FAQ List */}
            {FAQ_DATA.length === 0 ? (
                <View style={[styles.emptyState, { marginTop: spacing.xl }]}>
                    <Ionicons name="help-buoy-outline" size={48} color={colors.mutedForeground} />
                    <Text style={{ color: colors.mutedForeground, fontSize: typography.sizes.md, marginTop: spacing.md }}>
                        {t('help.noFaqs')}
                    </Text>
                </View>
            ) : (
                FAQ_DATA.map(item => (
                    <FAQItemCard
                        key={item.id}
                        item={item}
                        expanded={expandedId === item.id}
                        onToggle={() => handleToggle(item.id)}
                    />
                ))
            )}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    faqCard: {},
    questionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    questionText: {
        fontWeight: '600',
        flex: 1,
        marginRight: 12,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
