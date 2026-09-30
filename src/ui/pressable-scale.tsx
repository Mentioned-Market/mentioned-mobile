// A Pressable that gives a little under the finger: it springs to 97% on press
// and back on release. For cards, where an opacity dip alone feels flat; rows
// keep the dip, since a full-width row shrinking looks like a glitch.
//
// Works as `<Link asChild>`'s child: pass it a flat style, as any Pressable
// there must have, and Link's props are passed straight through.
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESSED = 0.97;
const SPRING = { damping: 18, stiffness: 420, mass: 0.6 } as const;

type Props = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> };

export function PressableScale({ style, onPressIn, onPressOut, children, ...rest }: Props) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const pressIn = (e: GestureResponderEvent) => {
    if (!reduceMotion) scale.set(withSpring(PRESSED, SPRING));
    onPressIn?.(e);
  };
  const pressOut = (e: GestureResponderEvent) => {
    scale.set(withSpring(1, SPRING));
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable {...rest} onPressIn={pressIn} onPressOut={pressOut} style={[style, pressed]}>
      {children}
    </AnimatedPressable>
  );
}
