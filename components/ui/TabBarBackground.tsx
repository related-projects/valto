import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabBarBackground() {
    return (
        <View
            style={{
                flex: 1,
                backgroundColor: 'rgba(255,255,255,0.8)', // Glass effect fallback
            }}
        />
    );
}

export function useBottomTabOverflow() {
    const tabHeight = useBottomTabBarHeight();
    const { bottom } = useSafeAreaInsets();
    return tabHeight - bottom;
}
