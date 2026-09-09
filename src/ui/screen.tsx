import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, type } from '@/ui/theme';

type Props = PropsWithChildren<{ title: string; subtitle?: string; back?: boolean; backLabel?: string; right?: ReactNode }>;

export function Screen({ title, subtitle, back = false, backLabel = 'Markets', right, children }: Props) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        {back ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
            <Text style={type.muted}>{backLabel}</Text>
          </Pressable>
        ) : null}
        <View style={styles.titleRow}>
          {title ? <Text style={[type.title, { flex: 1 }]}>{title}</Text> : null}
          {right}
        </View>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: -6, marginBottom: spacing.xs },
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
