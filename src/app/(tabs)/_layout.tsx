import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Pressable, type ColorValue, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts } from '@/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type IconProps = { color: ColorValue; size: number };

function TabIcon({ name, color, size }: IconProps & { name: IconName }) {
  return <Ionicons name={name} color={color} size={size} />;
}

// Android's default tab button draws a ripple that fights the black bar. A
// plain Pressable with a soft opacity dip reads better.
type TabButtonProps = Pick<PressableProps, 'children' | 'onPress' | 'onLongPress' | 'accessibilityState' | 'accessibilityLabel' | 'testID'> & {
  style?: StyleProp<ViewStyle>;
};

function TabButton({ children, style, onPress, onLongPress, accessibilityState, accessibilityLabel, testID }: TabButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      android_ripple={null}
      style={({ pressed }) => [style, pressed && { opacity: 0.6 }]}
    >
      {children}
    </Pressable>
  );
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
        tabBarButton: (props) => <TabButton {...(props as TabButtonProps)} />,
        animation: 'none',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: (p: IconProps) => <TabIcon name="home" {...p} /> }} />
      <Tabs.Screen name="markets" options={{ title: 'Markets', tabBarIcon: (p: IconProps) => <TabIcon name="grid" {...p} /> }} />
      <Tabs.Screen name="positions" options={{ title: 'Positions', tabBarIcon: (p: IconProps) => <TabIcon name="layers" {...p} /> }} />
      <Tabs.Screen name="ranks" options={{ title: 'Ranks', tabBarIcon: (p: IconProps) => <TabIcon name="trophy" {...p} /> }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: (p: IconProps) => <TabIcon name="person-circle" {...p} /> }} />
    </Tabs>
  );
}
