import { Stack } from 'expo-router';
import React from 'react';
import { HelpFAQScreen } from '../src/screens/HelpFAQScreen';

export default function HelpRoute() {
    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <HelpFAQScreen />
        </>
    );
}
