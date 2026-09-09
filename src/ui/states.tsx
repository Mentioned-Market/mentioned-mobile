// Loading, error and empty states shared by every screen (guide section 7).
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { ApiError } from '@/api/client';
import { colors, spacing, type } from '@/ui/theme';

export function Skeleton({ height = 16, width = '100%', radius = 8, style }: { height?: number; width?: number | `${number}%`; radius?: number; style?: ViewStyle }) {
  return <View style={[{ height, width, borderRadius: radius, backgroundColor: colors.surfaceRaised }, style]} />;
}

export function CardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton height={140} radius={0} />
      <View style={{ padding: spacing.md, gap: spacing.sm }}>
        <Skeleton height={20} width="80%" />
        <Skeleton height={14} width="55%" />
        <Skeleton height={30} />
        <Skeleton height={30} />
      </View>
    </View>
  );
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 404) return 'Not found.';
    if (e.status === 429) return 'Too many requests. Give it a moment.';
    if (e.status >= 500) return 'Mentioned is having trouble. Try again shortly.';
    return e.message;
  }
  if (e instanceof Error) {
    if (e.name === 'AbortError') return 'That took too long. Check your connection.';
    if (/network request failed|unable to resolve host|unknownhost|fetch failed|failed to connect|software caused connection abort/i.test(e.message)) {
      return "You're offline. Check your connection and try again.";
    }
    return e.message;
  }
  return 'Something went wrong.';
}

export function ErrorState({ error, onRetry, title = 'Could not load' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <View style={styles.block}>
      <Text style={type.heading}>{title}</Text>
      <Text style={type.muted}>{errorMessage(error)}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonLabel}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.block}>
      <Text style={type.heading}>{title}</Text>
      {body ? <Text style={type.muted}>{body}</Text> : null}
      {action ? (
        <Pressable onPress={action.onPress} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonLabel}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  block: {
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },
  buttonLabel: { ...type.heading, fontSize: 15, color: colors.bg },
});
