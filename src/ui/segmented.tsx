// A pill with two to four choices in it. The selected one is raised and, when
// it carries a tone, outlined in that colour: "Predict Yes" in green, "Predict
// No" in red, everything else in gold.
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius } from '@/ui/theme';

export type Segment<K extends string> = { key: K; label: string; tone?: 'yes' | 'no' | 'gold' };

type Props<K extends string> = {
  options: Segment<K>[];
  value: K;
  onChange: (k: K) => void;
  /** Fills the width it is given rather than hugging its labels. */
  stretch?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
};

const TONE = { yes: colors.yes, no: colors.no, gold: colors.gold } as const;

export function Segmented<K extends string>({ options, value, onChange, stretch = true, size = 'md', style }: Props<K>) {
  return (
    <View style={[styles.wrap, stretch && { alignSelf: 'stretch' }, style]}>
      {options.map((o) => {
        const active = o.key === value;
        const outline = TONE[o.tone ?? 'gold'];
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (active) return;
              Haptics.selectionAsync();
              onChange(o.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.item, size === 'sm' && styles.itemSm, stretch && { flex: 1 }, active && [styles.itemActive, { borderColor: outline }]]}
          >
            <Text style={[styles.label, size === 'sm' && styles.labelSm, active && { color: colors.text }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 4, borderRadius: radius.control, backgroundColor: colors.surface, alignSelf: 'flex-start' },
  item: { height: 44, paddingHorizontal: 18, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  itemSm: { height: 34, paddingHorizontal: 14 },
  itemActive: { backgroundColor: colors.surfaceRaised },
  label: { fontFamily: fonts.semibold, fontSize: 16, color: colors.textMuted },
  labelSm: { fontSize: 14 },
});
