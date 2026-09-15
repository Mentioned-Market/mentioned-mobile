// A round dark button holding one icon: the only chrome a screen header has.
// Give it `href` to make it a link; the style is kept flat because expo-router
// clones the child of an `asChild` Link and rejects an array or a function.
import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/ui/theme';

type Props = Omit<PressableProps, 'style'> & {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  href?: Href;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export const ICON_BUTTON_SIZE = 44;

export function IconButton({ name, label, href, size = 22, style, ...rest }: Props) {
  const button = (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      android_ripple={{ color: colors.surfaceRaised, borderless: true, radius: ICON_BUTTON_SIZE / 2 }}
      style={StyleSheet.flatten([styles.button, style])}
    >
      <Ionicons name={name} size={size} color={colors.text} />
    </Pressable>
  );
  if (!href) return button;
  return (
    <Link href={href} asChild>
      {button}
    </Link>
  );
}

const styles = StyleSheet.create({
  button: {
    width: ICON_BUTTON_SIZE,
    height: ICON_BUTTON_SIZE,
    borderRadius: ICON_BUTTON_SIZE / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
