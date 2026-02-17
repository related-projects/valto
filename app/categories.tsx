import { Stack } from 'expo-router';
import React from 'react';
import { CategoriesScreen } from '../src/screens/CategoriesScreen';

export default function CategoriesRoute() {
    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <CategoriesScreen />
        </>
    );
}
