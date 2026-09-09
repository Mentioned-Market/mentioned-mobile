import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, type } from '@/ui/theme';

type Props = PropsWithChildren<{ title: string; subtitle?: string }>;

export function Screen({ title, subtitle, children }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={type.title}>{title}</Text>
        {subtitle ? <Text style={[type.muted, styles.subtitle]}>{subtitle}</Text> : null}
      </View>
      <View style={styles.body}>{children}</View>
    </SafeAreaView>
  );
}

export function Placeholder({ step, label }: { step: number; label: string }) {
  return (
    <View style={styles.placeholder}>
      <Text style={type.heading}>{label}</Text>
      <Text style={[type.muted, styles.placeholderNote]}>Arrives in v0 build step {step}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  subtitle: { marginTop: spacing.xs },
  body: { flex: 1, paddingHorizontal: spacing.md },
  placeholder: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholderNote: { marginTop: spacing.xs },
});
