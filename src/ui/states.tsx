// Loading, error and empty states shared by every screen (guide section 7).
// The wording of an error lives in src/lib/error-message.ts, where it is tested.
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { errorMessage } from '@/lib/error-message';
import { Button } from '@/ui/button';
import { LoadingBlock } from '@/ui/loader';
import { colors, radius, spacing, type } from '@/ui/theme';

export function Skeleton({ height = 16, width = '100%', radius: r = 8, style }: { height?: number; width?: number | `${number}%`; radius?: number; style?: ViewStyle }) {
  return <View style={[{ height, width, borderRadius: r, backgroundColor: colors.surface }, style]} />;
}

/** A card-sized wait: the loading mark on a card. Kept under the old names so every screen shows it. */
export function CardSkeleton({ label }: { label?: string } = {}) {
  return <LoadingBlock height={220} label={label} />;
}

export function RowsSkeleton({ rows = 3, label }: { rows?: number; label?: string } = {}) {
  return <LoadingBlock height={Math.max(120, rows * 52)} label={label} />;
}

export function ErrorState({ error, onRetry, title = 'Could not load' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <View style={styles.block}>
      <Text style={type.heading}>{title}</Text>
      <Text style={type.muted}>{errorMessage(error)}</Text>
      {onRetry ? <Button label="Try again" tone="neutral" size="sm" onPress={onRetry} style={styles.action} /> : null}
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.block}>
      <Text style={type.heading}>{title}</Text>
      {body ? <Text style={type.muted}>{body}</Text> : null}
      {action ? <Button label={action.label} tone="neutral" size="sm" onPress={action.onPress} style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { padding: spacing.lg, borderRadius: radius.card, backgroundColor: colors.surface, gap: spacing.sm },
  action: { alignSelf: 'flex-start', marginTop: spacing.xs },
});
