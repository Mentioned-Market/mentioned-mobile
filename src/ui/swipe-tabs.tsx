// The tab navigator: the stock bottom tab bar over a pager, so a sideways
// swipe anywhere moves to the neighbouring tab, with both pages following the
// finger. A tap on the bar slides too, from the side the tab is on.
//
// Why not the stock pieces. Bottom tabs cannot be dragged, only animated after
// a tap. Material top tabs can, but pull in react-native-pager-view, a native
// pager that decides for itself which horizontal touches it takes, and the
// rails on Home and Markets need theirs.
//
// Rails keep their swipes without any list of places that do not count. A
// native horizontal ScrollView claims the touch once it has moved Android's
// 8dp slop, and when a native view does that gesture-handler cancels every
// gesture in the tree. The pager waits for `SWIPE_ACTIVATE`, so a rail that
// can scroll always gets there first. The screen's own vertical scroll wins
// the same way. A rail that fits on screen does not scroll, never claims the
// touch, and the swipe works over it.
//
// State is React Navigation's TabRouter, so the back button, deep links and
// `router.navigate('/markets')` behave as they did under bottom tabs. Pages
// are positioned only from shared values on the UI thread; React renders
// which pages exist, never where they are.
import * as Haptics from 'expo-haptics';
import { TabRouter, withLayoutContext } from 'expo-router';
import {
  CommonActions,
  SafeAreaProviderCompat,
  createNavigatorFactory,
  useNavigationBuilder,
  type ParamListBase,
  type TabActionHelpers,
  type TabNavigationState,
  type TabRouterOptions,
} from 'expo-router/react-navigation';
import { BottomTabBar, type BottomTabBarProps, type BottomTabNavigationEventMap, type BottomTabNavigationOptions, type BottomTabNavigatorProps } from 'expo-router/tabs';
import { useEffect, useState, type ReactNode } from 'react';
import { Dimensions, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Freeze } from 'react-freeze';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SWIPE_ACTIVATE, SWIPE_FAIL_Y, dragOffset, dragPeer, pageTranslate, settleDuration, settleTarget } from '@/lib/swipe-nav';

const SPRING = { damping: 22, stiffness: 240, mass: 0.7, overshootClamping: true } as const;
const TAP_TIMING = { duration: 260, easing: Easing.out(Easing.cubic) } as const;

/** Where a page that is not on screen is parked. Far enough to be neither drawn nor touched. */
const OFFSCREEN = 100_000;

/** The tab at `index` and the ones either side of it. */
function near(index: number, count: number): number[] {
  return [index - 1, index, index + 1].filter((i) => i >= 0 && i < count);
}

type ViewProps = Pick<BottomTabBarProps, 'state' | 'navigation' | 'descriptors'>;

function SwipeTabView({ state, navigation, descriptors }: ViewProps) {
  const insets = useSafeAreaInsets();
  const count = state.routes.length;

  // UI thread: the tab at rest, the tab being revealed (-1 for none), and how
  // far the pages have moved from rest.
  const width = useSharedValue(Dimensions.get('window').width);
  const visual = useSharedValue(state.index);
  const peer = useSharedValue(-1);
  const offset = useSharedValue(0);
  // A settle in flight. A drag that starts then is ignored rather than
  // picking the pages up mid-move, which would make them jump.
  const settling = useSharedValue(false);
  const ignoring = useSharedValue(false);

  // Pages are mounted once visited, and the neighbours of the current tab
  // ahead of time so a swipe always has a page to reveal.
  const [loaded, setLoaded] = useState(() => new Set(near(state.index, count).map((i) => state.routes[i].key)));
  // The tab being left. It stays unfrozen until its slide out has finished,
  // however far away the new tab is.
  const [leaving, setLeaving] = useState(-1);
  const [seenIndex, setSeenIndex] = useState(state.index);
  if (seenIndex !== state.index) {
    setSeenIndex(state.index);
    setLeaving(seenIndex);
    const missing = near(state.index, count).filter((i) => !loaded.has(state.routes[i].key));
    if (missing.length > 0) setLoaded(new Set([...loaded, ...missing.map((i) => state.routes[i].key)]));
  }

  // The tab a finished swipe moved to, set on the UI thread before it tells
  // the router, so the effect below knows the pages are already there.
  const swipedTo = useSharedValue(-1);

  // A change of tab the pager did not make itself (the tab bar, the back
  // button, a link) slides from the old page to the new one.
  useEffect(() => {
    const to = state.index;
    if (swipedTo.get() === to) {
      swipedTo.set(-1);
      return;
    }
    const from = visual.get();
    if (from === to) return;
    const w = width.get();
    cancelAnimation(offset);
    settling.set(true);
    peer.set(to);
    offset.set(0);
    offset.set(
      withTiming(to > from ? -w : w, TAP_TIMING, (finished) => {
        if (!finished) return;
        visual.set(to);
        peer.set(-1);
        offset.set(0);
        settling.set(false);
        runOnJS(setLeaving)(-1);
      }),
    );
  }, [state.index, visual, peer, offset, width, settling, swipedTo]);

  const onSwiped = (to: number) => {
    void Haptics.selectionAsync();
    navigation.dispatch({ ...CommonActions.navigate({ name: state.routes[to].name, merge: true }), target: state.key });
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-SWIPE_ACTIVATE, SWIPE_ACTIVATE])
    .failOffsetY([-SWIPE_FAIL_Y, SWIPE_FAIL_Y])
    .onStart(() => {
      ignoring.set(settling.get());
    })
    .onUpdate((e) => {
      if (ignoring.get()) return;
      const p = dragPeer(e.translationX, visual.get(), count);
      peer.set(p);
      offset.set(dragOffset(e.translationX, p));
    })
    .onEnd((e, success) => {
      if (ignoring.get()) return;
      const from = visual.get();
      const w = width.get();
      const to = success ? settleTarget(e.translationX, e.velocityX, w, from, count) : from;
      settling.set(true);
      if (to === from) {
        offset.set(
          withSpring(0, SPRING, (finished) => {
            settling.set(false);
            if (finished) peer.set(-1);
          }),
        );
        return;
      }
      const end = to > from ? -w : w;
      offset.set(
        withTiming(end, { duration: settleDuration(end - offset.get(), e.velocityX), easing: Easing.out(Easing.cubic) }, (finished) => {
          if (!finished) return;
          visual.set(to);
          peer.set(-1);
          offset.set(0);
          settling.set(false);
          swipedTo.set(to);
          runOnJS(onSwiped)(to);
        }),
      );
    });

  return (
    <SafeAreaProviderCompat>
      <GestureDetector gesture={pan}>
        <View style={styles.pages} onLayout={(e) => width.set(e.nativeEvent.layout.width)}>
          {state.routes.map((route, i) => {
            if (!loaded.has(route.key)) return null;
            const descriptor = descriptors[route.key];
            const focused = i === state.index;
            const live = Math.abs(i - state.index) <= 1 || i === leaving;
            return (
              <Page key={route.key} page={i} focused={focused} visual={visual} peer={peer} offset={offset} width={width} style={descriptor.options.sceneStyle}>
                {/* Freezing is what keeps five mounted tabs cheap: a frozen tab
                    skips every re-render until it is near the current one. */}
                <Freeze freeze={!live}>{descriptor.render()}</Freeze>
              </Page>
            );
          })}
        </View>
      </GestureDetector>
      <BottomTabBar state={state} navigation={navigation} descriptors={descriptors} insets={insets} />
    </SafeAreaProviderCompat>
  );
}

type PageProps = {
  page: number;
  focused: boolean;
  visual: SharedValue<number>;
  peer: SharedValue<number>;
  offset: SharedValue<number>;
  width: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

function Page({ page, focused, visual, peer, offset, width, style, children }: PageProps) {
  const position = useAnimatedStyle(() => {
    const x = pageTranslate(page, visual.get(), peer.get(), offset.get(), width.get());
    return x === null ? { opacity: 0, transform: [{ translateX: OFFSCREEN }] } : { opacity: 1, transform: [{ translateX: x }] };
  });
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, style, position]}
      // Pages off screen are still mounted; keep screen readers on this one.
      importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!focused}
    >
      {children}
    </Animated.View>
  );
}

function SwipeTabNavigator({
  id,
  initialRouteName,
  backBehavior,
  UNSTABLE_routeNamesChangeBehavior,
  children,
  layout,
  screenListeners,
  screenOptions,
  screenLayout,
  UNSTABLE_router,
}: BottomTabNavigatorProps) {
  const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder<
    TabNavigationState<ParamListBase>,
    TabRouterOptions,
    TabActionHelpers<ParamListBase>,
    BottomTabNavigationOptions,
    BottomTabNavigationEventMap
  >(TabRouter, {
    id,
    initialRouteName,
    backBehavior,
    UNSTABLE_routeNamesChangeBehavior,
    children,
    layout,
    screenListeners,
    screenOptions,
    screenLayout,
    UNSTABLE_router,
  });
  return (
    <NavigationContent>
      <SwipeTabView state={state} navigation={navigation as ViewProps['navigation']} descriptors={descriptors as ViewProps['descriptors']} />
    </NavigationContent>
  );
}

const { Navigator } = createNavigatorFactory(SwipeTabNavigator)();

/** Drop-in for expo-router's `Tabs`: same options, same tab bar, swipeable. */
export const SwipeTabs = withLayoutContext<BottomTabNavigationOptions, typeof SwipeTabNavigator, TabNavigationState<ParamListBase>, BottomTabNavigationEventMap>(Navigator);

const styles = StyleSheet.create({
  pages: { flex: 1, overflow: 'hidden' },
});
