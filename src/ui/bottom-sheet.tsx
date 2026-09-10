// Bottom sheet on a transparent Modal: drag it down to dismiss, or tap the
// backdrop.
//
// Body scrolls, footer does not. A sheet whose primary action is the last thing
// in a scrolling column hides that action exactly when the content is longest,
// which is the moment the user most wants it. Anything the sheet exists to do
// belongs in `footer`.
//
// The slide and the backdrop fade are driven here rather than by the Modal's
// own `animationType`, for two reasons. The backdrop has to track the drag, so
// the darkness lifts as the sheet is pulled down instead of holding full
// strength and then blinking out afterwards. And a drag that ends in a dismiss
// has to continue from wherever the finger left the sheet, which means the same
// value that the gesture writes must also drive the exit.
//
// Closing therefore animates FIRST and reports second: every path out of the
// sheet runs the exit and only calls `onClose` when it finishes. That keeps the
// Modal mounted for exactly as long as there is something to see, with no extra
// state to hold it there.
import { useCallback, useEffect, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, type } from '@/ui/theme';

/** Drag past this many points and the release dismisses rather than settles. */
const DISMISS_DISTANCE = 120;

/** A fast enough flick dismisses from anywhere, the way a scroll fling does. */
const DISMISS_VELOCITY = 800;

const SPRING = { damping: 22, stiffness: 240, mass: 0.7 } as const;
const EXIT_MS = 200;

/** Darkness of the backdrop when the sheet is fully open. */
const BACKDROP_OPACITY = 0.6;

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Pinned under the body, always on screen. The sheet's primary action. */
  footer?: ReactNode;
  children: ReactNode;
};

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

export function BottomSheet({ visible, onClose, title, subtitle, footer, children }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  // Distance the sheet sits below its resting place. `height` is always past the
  // bottom of the screen, so it doubles as the closed position.
  const translateY = useSharedValue(height);
  const scrollY = useSharedValue(0);

  // Slide out, then tell the parent. Used by the backdrop, the hardware back
  // button and the accessibility action; the drag does the same inline, on the
  // UI thread, so it can carry the finger's position into the animation.
  const close = useCallback(() => {
    translateY.set(
      withTiming(height, { duration: EXIT_MS }, (finished) => {
        if (finished) runOnJS(onClose)();
      }),
    );
  }, [height, onClose, translateY]);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  // The body's own scroll, named so the pan can be told to run alongside it.
  // A gesture object rather than a ref: passing a ref here trips the compiler's
  // "no refs during render" rule, and this is the form the library documents.
  const bodyScroll = Gesture.Native();

  // Dragging is allowed from anywhere on the sheet, but only downward and only
  // while the body is at its top. Without that second condition, scrolling a
  // long sheet back up would drag the whole thing off the screen instead.
  const pan = Gesture.Pan()
    // Downward only. Without this the pan wins the gesture arena on an upward
    // swipe and the body never scrolls at all.
    .activeOffsetY(12)
    // And when it does activate over a scrolled body, both need to run: the
    // list scrolls back up while the guard below keeps the sheet still.
    .simultaneousWithExternalGesture(bodyScroll)
    .onUpdate((e) => {
      if (e.translationY <= 0 || scrollY.get() > 0) return;
      translateY.set(e.translationY);
    })
    .onEnd((e) => {
      if (translateY.get() <= 0) return;
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        // Continue from where the finger let go rather than snapping first.
        translateY.set(
          withTiming(height, { duration: EXIT_MS }, (finished) => {
            if (finished) runOnJS(onClose)();
          }),
        );
        return;
      }
      translateY.set(withSpring(0, SPRING));
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }));

  // The backdrop is tied to the sheet's position rather than to `visible`, so it
  // lightens under the finger during a drag and is already gone by the time the
  // sheet is.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.get(), [0, height], [BACKDROP_OPACITY, 0], Extrapolation.CLAMP),
  }));

  // Shared values are written through set() rather than .value throughout this
  // file: the React Compiler treats the hook result as immutable and rejects
  // assignment to .value, and set()/get() is the accessor pair Reanimated
  // provides for exactly that reason.
  useEffect(() => {
    if (!visible) return;
    scrollY.set(0);
    // Start from closed every time. Without this reset a sheet dismissed by
    // dragging reopens still carrying that drag, and only comes up part way.
    translateY.set(height);
    translateY.set(withSpring(0, SPRING));
  }, [visible, height, translateY, scrollY]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      {/* A Modal is its own native window on Android, so it needs its own
          gesture root; the one at the app root does not reach inside it. */}
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, sheetStyle, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            <View
              style={styles.grabber}
              accessibilityRole="adjustable"
              accessibilityLabel="Drag down to close"
              accessibilityActions={[{ name: 'decrement', label: 'Close' }]}
              onAccessibilityAction={close}
            >
              <View style={styles.handle} />
            </View>
            {title ? (
              <View style={styles.header}>
                <Text style={type.heading} numberOfLines={1}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {/* flexShrink lets the body give up height to the header and footer
                when the content is tall, instead of pushing the footer off the
                bottom of the sheet. */}
            <GestureDetector gesture={bodyScroll}>
              <AnimatedScrollView
                style={styles.body}
                bounces={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.bodyContent}
                keyboardShouldPersistTaps="handled"
                onScroll={onScroll}
                scrollEventThrottle={16}
              >
                {children}
              </AnimatedScrollView>
            </GestureDetector>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  sheet: {
    maxHeight: '94%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  // A generous touch target around the handle: the bar itself is 5pt tall and
  // is an affordance, not a hit area.
  grabber: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.sm },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border },
  header: { paddingBottom: spacing.sm },
  subtitle: { ...type.muted, fontSize: 13, lineHeight: 18 },
  body: { flexShrink: 1 },
  bodyContent: { gap: spacing.sm },
  footer: { paddingTop: spacing.sm },
});
