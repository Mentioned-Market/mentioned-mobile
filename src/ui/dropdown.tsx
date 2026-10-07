// A dropdown: a filter button that opens a short list under itself, for a
// choice with too many options to lay out in a row (the category on Markets).
// The button is the filter row's own shape (src/ui/filter-tabs.tsx) and fills
// in white while a choice is in force, so a narrowed list never looks like the
// whole one.
//
// The list is drawn in a Modal so it sits above everything, placed from where
// the button measures itself to be on screen: under it, with its right edge on
// the button's. A tap anywhere else puts it away.
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { filterButton } from '@/ui/filter-tabs';
import { colors, fonts, spacing } from '@/ui/theme';

export type DropdownOption = { key: string; label: string };

type Props = {
  /** What the button says while nothing is chosen, e.g. "Category". */
  placeholder: string;
  /** The first row of the list: choosing it clears the choice, e.g. "All categories". */
  clearLabel: string;
  options: DropdownOption[];
  value: string | null;
  onChange: (key: string | null) => void;
  style?: StyleProp<ViewStyle>;
};

const ROW = 46;
const GAP = 6;
/** About six and a half rows, so a longer list shows that it scrolls. */
const MAX_HEIGHT = ROW * 6.5;

export function Dropdown({ placeholder, clearLabel, options, value, onChange, style }: Props) {
  const button = useRef<View>(null);
  const window = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const chosen = options.find((o) => o.key === value) ?? null;

  const open = () => {
    button.current?.measureInWindow((x, y, width, height) => {
      Haptics.selectionAsync();
      setAnchor({ top: y + height + GAP, right: Math.max(spacing.md, window.width - (x + width)) });
    });
  };
  const choose = (key: string | null) => {
    setAnchor(null);
    if (key === value) return;
    Haptics.selectionAsync();
    onChange(key);
  };

  return (
    <>
      <Pressable
        ref={button}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={chosen ? `${placeholder}: ${chosen.label}` : placeholder}
        accessibilityState={{ expanded: anchor !== null }}
        style={[filterButton.base, styles.button, chosen && filterButton.active, style]}
      >
        <Text style={[filterButton.label, styles.buttonLabel, chosen && filterButton.labelActive]} numberOfLines={1}>
          {chosen?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={14} color={chosen ? colors.bg : colors.textMuted} />
      </Pressable>

      <Modal visible={anchor !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAnchor(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setAnchor(null)} accessibilityLabel="Close" />
        {anchor ? (
          <View style={[styles.menu, { top: anchor.top, right: anchor.right, maxHeight: Math.min(MAX_HEIGHT, window.height - anchor.top - spacing.xl) }]}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              <Option label={clearLabel} active={value === null} first onPress={() => choose(null)} />
              {options.map((o) => (
                <Option key={o.key} label={o.label} active={o.key === value} onPress={() => choose(o.key)} />
              ))}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

function Option({ label, active, first, onPress }: { label: string; active: boolean; first?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.option, !first && styles.divider, pressed && styles.pressed]}
    >
      <Text style={[styles.optionLabel, active && { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      {active ? <Ionicons name="checkmark" size={16} color={colors.gold} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Shrinks before the tabs beside it do, and cuts a long name short.
  button: { flexShrink: 1, gap: 4 },
  buttonLabel: { flexShrink: 1 },
  menu: {
    position: 'absolute',
    minWidth: 190,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
    elevation: 12,
  },
  option: { height: ROW, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.06)' },
  optionLabel: { fontFamily: fonts.medium, fontSize: 15, color: colors.textMuted, flexShrink: 1 },
});
