import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { colors, fonts } from '@/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type IconProps = { color: ColorValue; size: number };

function TabIcon({ name, color, size }: IconProps & { name: IconName }) {
  return <Ionicons name={name} color={color} size={size} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Markets', tabBarIcon: (p: IconProps) => <TabIcon name="grid" {...p} /> }}
      />
      <Tabs.Screen
        name="positions"
        options={{ title: 'Positions', tabBarIcon: (p: IconProps) => <TabIcon name="layers" {...p} /> }}
      />
      <Tabs.Screen
        name="ranks"
        options={{ title: 'Ranks', tabBarIcon: (p: IconProps) => <TabIcon name="trophy" {...p} /> }}
      />
      <Tabs.Screen
        name="you"
        options={{ title: 'You', tabBarIcon: (p: IconProps) => <TabIcon name="person-circle" {...p} /> }}
      />
    </Tabs>
  );
}
