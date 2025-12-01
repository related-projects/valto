import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { HapticTab } from '../../components/haptic-tab';
import TabBarBackground from '../../components/ui/TabBarBackground';
import { useTheme } from '../../src/theme/theme';

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.navActive,
        tabBarInactiveTintColor: colors.navInactive,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: 'absolute',
            backgroundColor: colors.navBackground,
            borderTopColor: colors.border,
          },
          default: {
            backgroundColor: colors.navBackground,
            borderTopColor: colors.border,
          },
        }),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <Ionicons size={24} name="grid-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color }) => <Ionicons size={24} name="list-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="wallets"
        options={{
          title: 'Wallets',
          tabBarIcon: ({ color }) => <Ionicons size={24} name="wallet-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Ionicons size={24} name="settings-outline" color={color} />,
        }}
      />
    </Tabs>
  );
}
