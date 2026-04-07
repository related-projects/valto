/**
 * ErrorFallback
 *
 * Stateless fallback UI rendered when ErrorBoundary catches a render error.
 * Uses hardcoded colors to remain functional even if ThemeProvider is unavailable.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import i18n from '../../localization/i18n';

interface ErrorFallbackProps {
    error: Error;
    onReset: () => void;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, onReset }) => (
    <View style={styles.container}>
        <Text style={styles.emoji}>😔</Text>
        <Text style={styles.title}>{i18n.t('common.somethingWentWrong')}</Text>
        <Text style={styles.message}>
            {i18n.t('common.fatalError')}
        </Text>
        {__DEV__ && (
            <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error.message}</Text>
            </View>
        )}
        <TouchableOpacity style={styles.button} onPress={onReset} activeOpacity={0.8}>
            <Text style={styles.buttonText}>{i18n.t('common.reloadApp')}</Text>
        </TouchableOpacity>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
        backgroundColor: '#0A0A0A',
    },
    emoji: {
        fontSize: 48,
        marginBottom: 16,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: '#FAFAFA',
        marginBottom: 8,
    },
    message: {
        fontSize: 15,
        color: '#A1A1AA',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    errorBox: {
        backgroundColor: '#1C1C1E',
        borderRadius: 8,
        padding: 12,
        marginBottom: 24,
        width: '100%',
    },
    errorText: {
        fontSize: 12,
        color: '#EF4444',
        fontFamily: 'Courier',
    },
    button: {
        backgroundColor: '#6366F1',
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 12,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
});
