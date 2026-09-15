// The frame every screen sits in: a safe area, a header of a title and at most
// one round button each side, and the body under it with the page gutter.
//
// A pushed screen gets a round chevron on the left; a sheet-like screen gets an
// X instead. Neither is labelled: the title says where you are and the button
// says how to leave, and a "Back to Markets" caption was a third thing saying
// what the other two already did.
import { useRouter } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ICON_BUTTON_SIZE, IconButton } from '@/ui/icon-button';
import { colors, spacing, type } from '@/ui/theme';

type Props = PropsWithChildren<{
  title?: string;
  /** Draws the leave button: a chevron for a pushed screen, an X for a modal one. */
  back?: boolean | 'close';
  right?: ReactNode;
  /** Something in place of the title, e.g. the wordmark. */
  left?: ReactNode;
  /** Removes the body gutter, for a screen whose list needs the full width. */
  flush?: boolean;
}>;

export function Screen({ title, back = false, right, left, flush = false, children }: Props) {
  const router = useRouter();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        {back ? <IconButton name={back === 'close' ? 'close' : 'chevron-back'} label={back === 'close' ? 'Close' : 'Back'} onPress={leave} /> : null}
        {left}
        {title ? (
          <Text style={[type.title, styles.title]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {right}
      </View>
      <View style={[styles.body, flush && { paddingHorizontal: 0 }]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    minHeight: ICON_BUTTON_SIZE + spacing.sm + spacing.md,
  },
  title: { flex: 1 },
  body: { flex: 1, paddingHorizontal: spacing.md },
});
