import { Stack } from 'expo-router';
import React from 'react';
import { AboutScreen } from '../src/screens/AboutScreen';

export default function AboutRoute() {
    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <AboutScreen />
        </>
    );
}
