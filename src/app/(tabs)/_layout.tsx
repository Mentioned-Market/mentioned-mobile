import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Pressable, type ColorValue, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts } from '@/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type IconProps = { color: ColorValue; size: number };

// Hoisted so the navigator is not handed a new component on every render.
const icon = (name: IconName) => {
  const TabIcon = ({ color, size }: IconProps) => <Ionicons name={name} color={color} size={size} />;
  TabIcon.displayName = `TabIcon(${name})`;
  return TabIcon;
};

const ICONS = {
  home: icon('home'),
  markets: icon('grid'),
  positions: icon('layers'),
  ranks: icon('trophy'),
  you: icon('person-circle'),
};

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

const renderTabButton = (props: object) => <TabButton {...(props as TabButtonProps)} />;

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
        tabBarButton: renderTabButton,
        animation: 'none',
        // Every tab polls while focused and stays mounted once visited. Without
        // this, a blurred screen still re-renders on each state change, so five
        // trees repaint on a tab press. Freezing them is the difference between
        // an instant switch and a visible stall.
        freezeOnBlur: true,
        lazy: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ICONS.home }} />
      <Tabs.Screen name="markets" options={{ title: 'Markets', tabBarIcon: ICONS.markets }} />
      <Tabs.Screen name="positions" options={{ title: 'Positions', tabBarIcon: ICONS.positions }} />
      <Tabs.Screen name="ranks" options={{ title: 'Ranks', tabBarIcon: ICONS.ranks }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: ICONS.you }} />
    </Tabs>
  );
}
