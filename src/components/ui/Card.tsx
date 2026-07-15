import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/theme';

interface CardProps {
    children: React.ReactNode;
    style?: ViewStyle;
    variant?: 'default' | 'elevated' | 'flat';
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
    children,
    style,
    variant = 'default',
    padding = 'md',
}) => {
    const { colors, radius, shadows, spacing } = useTheme();

    const getShadow = () => {
        switch (variant) {
            case 'elevated': return shadows.elevated;
            case 'flat': return {};
            default: return shadows.card;
        }
    };

    const getPadding = () => {
        switch (padding) {
            case 'none': return 0;
            case 'sm': return spacing.sm;
            case 'lg': return spacing.lg;
            default: return spacing.md;
        }
    };

    return (
        <View
            style={[
                {
                    backgroundColor: colors.card,
                    borderRadius: radius.xl,
                    padding: getPadding(),
                    ...getShadow(),
                },
                style,
            ]}
        >
            {children}
        </View>
    );
};
