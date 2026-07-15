import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/theme';

interface AvatarProps {
    label: string;
    size?: 'sm' | 'md' | 'lg';
}

export const Avatar: React.FC<AvatarProps> = ({ label, size = 'md' }) => {
    const { colors, typography, radius } = useTheme();

    const getSize = () => {
        switch (size) {
            case 'sm':
                return { width: 40, height: 40, fontSize: typography.sizes.lg };
            case 'lg':
                return { width: 56, height: 56, fontSize: typography.sizes['2xl'] };
            default:
                return { width: 48, height: 48, fontSize: typography.sizes.xl };
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
                    width: getSize().width,
                    height: getSize().height,
                    borderRadius: getBorderRadius(),
                    backgroundColor: colors.accent,
                },
            ]}
        >
            <Text
                style={{
                    color: colors.accentForeground,
                    fontSize: getSize().fontSize,
                    fontWeight: typography.weights.bold,
                }}
            >
                {label}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
