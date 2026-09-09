// Bottom-pinned action bar used by every market screen. Sits over the scroll
// content; screens add bottom padding equal to PINNED_BAR_HEIGHT.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/ui/button';
import { colors, spacing, type } from '@/ui/theme';

export const PINNED_BAR_HEIGHT = 120;

type Props = {
  title: string;
  subtitle?: string;
  button: { label: string; tone?: 'gold' | 'yes' | 'no' | 'neutral'; disabled?: boolean; onPress?: () => void };
  note?: string;
  left?: ReactNode;
};

export function PinnedBar({ title, subtitle, button, note, left }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <View style={styles.row}>
        {left ?? (
          <View style={{ flex: 1 }}>
            <Text style={type.heading} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={type.muted} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        )}
        <Button label={button.label} tone={button.tone} disabled={button.disabled} onPress={button.onPress} style={{ minWidth: 160 }} />
      </View>
      {note ? <Text style={[type.muted, { textAlign: 'right', marginTop: 6 }]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.md, paddingTop: spacing.sm, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
