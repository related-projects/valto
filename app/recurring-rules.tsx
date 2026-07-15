/**
 * Recurring Rules Route
 * Expo Router route file — hides default header (screen has its own).
 */

import { Stack } from 'expo-router';
import React from 'react';
import { RecurringRulesScreen } from '@/src/screens/RecurringRulesScreen';

export default function RecurringRulesPage() {
    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <RecurringRulesScreen />
        </>
    );
}
