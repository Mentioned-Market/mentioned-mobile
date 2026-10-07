// A row of separate filter buttons: the choice between a few views of one
// list, e.g. All / Free / Paid on Markets. The website's own filter, sized for
// a thumb: squared-off buttons that stand apart, hairline and faint until
// chosen, solid white once they are. A count can sit beside the label, set
// quieter than it.
//
// Not a `Segmented`: that is one pill holding its choices, for a setting
// inside a card or a sheet. This is a filter over a page.
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts } from '@/ui/theme';

export type FilterTab<K extends string> = { key: K; label: string; count?: number };

type Props<K extends string> = {
  tabs: FilterTab<K>[];
  value: K;
  onChange: (k: K) => void;
  style?: StyleProp<ViewStyle>;
};

export function FilterTabs<K extends string>({ tabs, value, onChange, style }: Props<K>) {
  return (
    <View style={[styles.row, style]} accessibilityRole="tablist">
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => {
              // The chosen tab still answers a tap: on Markets, "All" also
              // clears the category, which can be set while All is showing.
              if (!active) Haptics.selectionAsync();
              onChange(t.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t.count === undefined ? t.label : `${t.label}, ${t.count}`}
            style={[filterButton.base, active && filterButton.active]}
          >
            <Text style={[filterButton.label, active && filterButton.labelActive]} numberOfLines={1}>
              {t.label}
            </Text>
            {t.count === undefined ? null : <Text style={[filterButton.label, styles.count, active && filterButton.labelActive]}>{t.count}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

/** The one button shape a filter row is made of, shared with the dropdown that sits beside it. */
export const filterButton = StyleSheet.create({
  base: {
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  active: { backgroundColor: colors.text, borderColor: colors.text },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18, color: colors.textMuted },
  labelActive: { color: colors.bg },
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { opacity: 0.6, fontVariant: ['tabular-nums'] },
});
