import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/theme';

interface IconBadgeProps {
    icon: React.ReactNode;
    backgroundColor?: string;
    size?: 'sm' | 'md' | 'lg';
}

export const IconBadge: React.FC<IconBadgeProps> = ({ icon, backgroundColor, size = 'md' }) => {
    const { colors, spacing, radius } = useTheme();

    const getSize = () => {
        switch (size) {
            case 'sm':
                return { width: 32, height: 32, padding: spacing.sm };
            case 'lg':
                return { width: 44, height: 44, padding: spacing.md };
            default:
                return { width: 36, height: 36, padding: spacing.sm };
        }
    };

    const getBorderRadius = () => {
        const sizeValue = getSize();
        return sizeValue.width / 2;
    };

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: backgroundColor || colors.iconBadgeBackground,
                    borderRadius: getBorderRadius(),
                    ...getSize(),
                },
            ]}
        >
            {icon}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
