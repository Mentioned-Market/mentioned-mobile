import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, type ColorValue, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { SwipeTabs } from '@/ui/swipe-tabs';
import { colors, fonts } from '@/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type IconProps = { color: ColorValue; size: number };

// Hoisted so the navigator is not handed a new component on every render.
const icon = (name: IconName) => {
  const TabIcon = ({ color, size }: IconProps) => <Ionicons name={name} color={color} size={size} />;
  TabIcon.displayName = `TabIcon(${name})`;
  return TabIcon;
};

// Five tabs (SPEC section 10). Positions live under Home and Me rather than in
// the bar; the Arena has its own tab because it is a competition of its own.
const ICONS = {
  home: icon('home'),
  markets: icon('grid'),
  ranks: icon('trophy'),
  arena: icon('shield'),
  you: icon('person'),
};

// Android's default tab button draws a ripple that fights the black bar. A
// plain Pressable with a soft opacity dip reads better.
type TabButtonProps = Pick<PressableProps, 'children' | 'onPress' | 'onLongPress' | 'accessibilityState' | 'accessibilityLabel' | 'testID'> & {
  style?: StyleProp<ViewStyle>;
};

function TabButton({ children, style, onPress, onLongPress, accessibilityState, accessibilityLabel, testID }: TabButtonProps) {
  return (
    <Pressable
      onPress={(e) => {
        // A tick when the tab changes, as a swipe gives; nothing on the tab you are on.
        if (!accessibilityState?.selected) void Haptics.selectionAsync();
        onPress?.(e);
      }}
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
    <SwipeTabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.bg },
        tabBarButton: renderTabButton,
        // No animation, freezeOnBlur or lazy here: SwipeTabs does its own
        // sliding, and freezes every tab but the current one and its
        // neighbours (src/ui/swipe-tabs.tsx).
      }}
    >
      <SwipeTabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ICONS.home }} />
      <SwipeTabs.Screen name="markets" options={{ title: 'Markets', tabBarIcon: ICONS.markets }} />
      <SwipeTabs.Screen name="ranks" options={{ title: 'Ranks', tabBarIcon: ICONS.ranks }} />
      <SwipeTabs.Screen name="arena" options={{ title: 'Arena', tabBarIcon: ICONS.arena }} />
      <SwipeTabs.Screen name="you" options={{ title: 'Me', tabBarIcon: ICONS.you }} />
    </SwipeTabs>
  );
}
