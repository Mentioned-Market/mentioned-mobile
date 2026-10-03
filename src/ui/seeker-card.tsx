// The Seeker card on Me: link the Seeker's Seed Vault wallet to this account,
// then collect the welcome stake. What it says and offers comes from
// `@/lib/seeker-perk`; the steps are `useSeekerFlow`, shared with Home's offer.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { SeekerStatus } from '@/api/seeker';
import { seekerCard } from '@/lib/seeker-perk';
import { useSeekerFlow } from '@/lib/use-seeker-flow';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { colors, spacing, type } from '@/ui/theme';

export function SeekerCard({ sessionWallet, status }: { sessionWallet: string; status: SeekerStatus }) {
  const flow = useSeekerFlow(sessionWallet, status);
  const card = seekerCard(status, flow.justFunded);
  if (!card) return null;

  return (
    <Card style={[styles.card, card.celebrate && styles.celebrate]}>
      <View style={styles.head}>
        <Ionicons
          name={card.celebrate ? 'gift' : card.verified ? 'checkmark-circle' : 'phone-portrait-outline'}
          size={card.celebrate ? 26 : 22}
          color={card.verified ? colors.gold : colors.text}
        />
        <Text style={card.celebrate ? styles.celebrateTitle : type.heading}>{card.title}</Text>
      </View>
      <Text style={card.celebrate ? styles.celebrateBody : type.muted}>{card.body}</Text>
      {flow.error ? <Text style={styles.error}>{flow.error}</Text> : null}
      {card.action && card.cta ? (
        <Button
          label={flow.busyLabel ?? card.cta}
          tone={card.action === 'check' || card.action === 'history' ? 'neutral' : 'gold'}
          disabled={flow.busy}
          onPress={() => void flow.run(card.action!)}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  error: { ...type.muted, color: colors.no },
  celebrate: { backgroundColor: colors.goldTint },
  celebrateTitle: { ...type.heading, fontSize: 20, lineHeight: 26, color: colors.gold },
  celebrateBody: { ...type.body, color: colors.text },
});
