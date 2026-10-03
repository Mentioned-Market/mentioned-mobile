// The integrity confirmation: a short checklist a wallet agrees to before a
// real-money trade or an Arena entry. The words are the website's, ported in
// src/lib/attestation.ts; this only draws them.
//
// What must hold, as on the web:
//  - every box starts unticked on every open, never pre-ticked
//  - the confirm button stays disabled until every box is ticked
//  - dragging down, the backdrop, back and Cancel all cancel and write nothing
//  - while the confirmation is being saved the sheet cannot be dismissed, so a
//    cancel can never race a row into the audit table
//
// It reports its outcome only once it has slid away (`onClosed`), so whatever
// follows, a trade's progress for one, is never drawn underneath it.
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { API_BASE } from '@/config';
import { ATTESTATION_COPY, INTEGRITY_RULES_PATH, canConfirm, type AttestationCopy, type AttestationVariant } from '@/lib/attestation';
import { BottomSheet, type BottomSheetHandle } from '@/ui/bottom-sheet';
import { Button } from '@/ui/button';
import { TextLink } from '@/ui/text-link';
import { colors, radius, spacing, type } from '@/ui/theme';

type Props = {
  variant: AttestationVariant;
  /** Alternative framing for the same commitments (same checkboxes, same row). */
  copy?: AttestationCopy;
  /**
   * Save the confirmation. Resolve true once it is recorded, which closes the
   * sheet, or with a sentence to show while it stays open. Resolving null
   * leaves it open and silent, for when the caller is swapping the sheet.
   */
  onConfirm: () => Promise<true | string | null>;
  /** The sheet has finished closing. `confirmed` is false for every way out but a saved confirmation. */
  onClosed: (confirmed: boolean) => void;
};

export function AttestationSheet({ variant, copy: copyOverride, onConfirm, onClosed }: Props) {
  const copy = copyOverride ?? ATTESTATION_COPY[variant];
  const [ticked, setTicked] = useState<boolean[]>(() => copy.checkboxes.map(() => false));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sheetRef = useRef<BottomSheetHandle>(null);

  const ready = canConfirm(ticked, variant);

  // The sheet refuses to close while it is saving, and its `close` only learns
  // that saving is over on the next render. So a saved confirmation closes the
  // sheet from an effect, after that render, rather than in the same tick.
  useEffect(() => {
    if (saved) sheetRef.current?.close();
  }, [saved]);

  const confirm = async () => {
    if (!ready || saving || saved) return;
    setSaving(true);
    setError(null);
    const outcome = await onConfirm();
    setSaving(false);
    if (outcome === true) setSaved(true);
    else if (outcome) setError(outcome);
  };

  return (
    <BottomSheet
      ref={sheetRef}
      visible
      onClose={() => onClosed(saved)}
      title={copy.title}
      locked={saving}
      footer={
        <View style={styles.actions}>
          <Button label={copy.cancelLabel} tone="neutral" onPress={() => sheetRef.current?.close()} disabled={saving || saved} style={{ flex: 1 }} />
          <Button label={saving ? 'Saving' : copy.confirmLabel} onPress={() => void confirm()} disabled={!ready || saving || saved} style={{ flex: 1.4 }} />
        </View>
      }
    >
      <Text style={type.body}>{copy.intro}</Text>
      <View style={styles.boxes}>
        {copy.checkboxes.map((text, i) => (
          <Pressable
            key={text}
            onPress={() => setTicked((prev) => prev.map((v, j) => (j === i ? !v : v)))}
            disabled={saving || saved}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ticked[i], disabled: saving || saved }}
            accessibilityLabel={text}
            style={[styles.row, ticked[i] && styles.rowTicked]}
          >
            <View style={[styles.box, ticked[i] && styles.boxTicked]}>{ticked[i] ? <Ionicons name="checkmark" size={16} color={colors.bg} /> : null}</View>
            <Text style={[type.body, styles.rowText]}>{text}</Text>
          </Pressable>
        ))}
      </View>
      {copy.footer ? <Text style={type.muted}>{copy.footer}</Text> : null}
      {error ? (
        <Text style={[type.muted, { color: colors.no }]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {copy.rulesLink ? <TextLink label="Integrity rules" onPress={() => void Linking.openURL(API_BASE + INTEGRITY_RULES_PATH)} /> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
  boxes: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 4,
    padding: spacing.sm + 4,
    borderRadius: radius.key,
    backgroundColor: colors.surface,
  },
  rowTicked: { backgroundColor: colors.surfaceRaised },
  // 22 tall to match the body line height, so the box centres on the first line.
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxTicked: { backgroundColor: colors.gold, borderColor: colors.gold },
  rowText: { flex: 1 },
});
