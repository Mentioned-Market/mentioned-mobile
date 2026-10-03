// The frame every screen sits in: a safe area, a header, and the body under it
// with the page gutter. The header is the leave button, the title, anything
// the screen adds on the right, then search, chat and notifications
// (`HeaderActions`), which every screen carries unless it opts out.
//
// A pushed screen gets a round chevron on the left; a sheet-like screen gets an
// X instead. Neither is labelled: the title says where you are and the button
// says how to leave, and a "Back to Markets" caption was a third thing saying
// what the other two already did.
import { useRouter } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ALL_ACTIONS, HeaderActions, type HeaderAction } from '@/ui/header-actions';
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
  /**
   * Which of search, chat and notifications to show; all three by default.
   * A screen that is one of them leaves itself out; a flow that should not be
   * left halfway passes `false`.
   */
  actions?: HeaderAction[] | false;
}>;

export function Screen({ title, back = false, right, left, flush = false, actions = ALL_ACTIONS, children }: Props) {
  const router = useRouter();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        {back ? <IconButton name={back === 'close' ? 'close' : 'chevron-back'} label={back === 'close' ? 'Close' : 'Back'} onPress={leave} /> : null}
        {left}
        {title ? (
          // Shrinks a little to fit beside the header actions rather than
          // cutting a word like "Notifications" short.
          <Text style={[type.title, styles.title]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header">
            {title}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {right}
        {actions && actions.length > 0 ? <HeaderActions show={actions} /> : null}
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
