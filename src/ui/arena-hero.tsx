// The Arena, as the thing Home leads with while a season is open.
//
// The backdrop is the same painted hero the website's season page uses, taken
// from the season and fetched from the site itself, so the two cannot drift.
// Seasons before this one carry an SVG there, which expo-image does not draw
// reliably, so anything but a bitmap falls back to the gold ground and the
// card reads the same.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { seasonStatus } from '@/arena/seasons';
import { useSeasons } from '@/arena/use-seasons';
import { API_BASE } from '@/config';
import { formatCountdown, leaderboardPool, seasonCountdown } from '@/lib/arena-view';
import { useNow } from '@/lib/use-now';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

const BITMAP = /\.(jpg|jpeg|png|webp)$/i;

export function ArenaHero() {
  // Its own clock: the countdown ticks without re-rendering the rest of Home.
  const now = useNow(1000);
  const [failed, setFailed] = useState(false);
  const arena = useSeasons().current;
  const status = seasonStatus(arena, new Date(now));
  if (status === 'ended') return null;

  const countdown = seasonCountdown(arena, now);
  const image = BITMAP.test(arena.heroImage) && !failed ? `${API_BASE}${arena.heroImage}` : null;

  return (
    <Link href="/arena" asChild>
      <Pressable style={styles.card} accessibilityRole="link" accessibilityLabel={`${arena.name} Arena`}>
        {image ? (
          <>
            <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} onError={() => setFailed(true)} />
            {/* The painted backdrop is bright in places; the wash is what keeps
                the type legible over it. */}
            <View style={[StyleSheet.absoluteFill, styles.wash]} />
          </>
        ) : null}

        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {arena.emoji} {arena.name}
          </Text>
          <Text style={styles.tagline} numberOfLines={2}>
            {arena.tagline}
          </Text>
          <View style={styles.footer}>
            <View style={styles.pill}>
              <Text style={styles.pillText} numberOfLines={1}>
                {countdown ? `${countdown.label} ${formatCountdown(countdown.ms)}` : 'Live now'}
              </Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText} numberOfLines={1}>
                Top {arena.prizes.length} share {leaderboardPool(arena)}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 190, borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.goldTint, justifyContent: 'flex-end' },
  wash: { backgroundColor: 'rgba(0,0,0,0.5)' },
  body: { padding: spacing.md, gap: 4 },
  title: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 38, color: colors.text, letterSpacing: -0.5, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8 },
  tagline: { ...type.muted, color: 'rgba(255,255,255,0.85)', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  pill: { paddingHorizontal: 12, height: 32, borderRadius: radius.control, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center' },
  pillText: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 17, color: colors.gold, fontVariant: ['tabular-nums'] },
});
