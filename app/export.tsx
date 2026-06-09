/**
 * Export Route
 * Expo Router route file — hides default header (screen has its own).
 */

import { Stack } from 'expo-router';
import React from 'react';
import { ExportScreen } from '@/src/screens/ExportScreen';

export default function ExportPage() {
    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <ExportScreen />
        </>
    );
}
