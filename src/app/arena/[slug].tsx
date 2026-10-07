// A team's page, as mentioned.market/arena/<team> shows it: avatar, name, bio,
// X account, season and all-time totals, and every member's points. The
// captain can edit the details, change the picture and share the join code.
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { teamAvatarUrl, updateTeam, uploadTeamAvatar } from '@/api/arena';
import { keys, useTeam } from '@/api/queries';
import { BIO_MAX, avatarError, bioError, friendlyTeamError, readXHandle, teamNameError } from '@/lib/arena-view';
import { shortAddress } from '@/lib/format';
import { useSession } from '@/store/session';
import { BottomSheet, type BottomSheetHandle } from '@/ui/bottom-sheet';
import { Button } from '@/ui/button';
import { Card, SectionTitle, Stat, rowStyle } from '@/ui/card';
import { Pill } from '@/ui/pill';
import { Screen } from '@/ui/screen';
import { Segmented } from '@/ui/segmented';
import { CardSkeleton, ErrorState } from '@/ui/states';
import { SeekerBadge } from '@/ui/seeker-badge';
import { colors, fonts, radius, spacing, type } from '@/ui/theme';

type Sort = 'season' | 'all';

const SORTS: { key: Sort; label: string }[] = [
  { key: 'season', label: 'Season' },
  { key: 'all', label: 'All time' },
];

export default function TeamScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const wallet = useSession((s) => s.wallet);
  const team = useTeam(slug, wallet);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<Sort>('season');

  // Avatar: the image route 404s for a team without one, which falls back to a shield.
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);

  const sheetRef = useRef<BottomSheetHandle>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [xHandle, setXHandle] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const members = useMemo(() => {
    const list = [...(team.data?.members ?? [])];
    return sort === 'season' ? list.sort((a, b) => b.weekly_points - a.weekly_points) : list.sort((a, b) => b.all_time_points - a.all_time_points);
  }, [team.data, sort]);

  const isCaptain = !!wallet && !!team.data?.members.some((m) => m.wallet === wallet && m.role === 'captain');

  const refresh = () => {
    setRefreshing(true);
    team.refetch().finally(() => setRefreshing(false));
  };

  const startEditing = () => {
    const t = team.data?.team;
    setName(t?.name ?? '');
    setBio(t?.bio ?? '');
    setXHandle(t?.x_url ?? '');
    setEditError(null);
    setEditing(true);
  };

  const save = async () => {
    const current = team.data?.team;
    if (!wallet || !current) return;
    const problem = teamNameError(name) ?? bioError(bio);
    if (problem) {
      setEditError(problem);
      return;
    }
    const x = readXHandle(xHandle);
    if ('error' in x) {
      setEditError(x.error);
      return;
    }
    // Only what changed goes up, so an untouched field is never rewritten.
    const fields: { name?: string; bio?: string; x_url?: string | null } = {};
    if (name.trim() !== current.name) fields.name = name.trim();
    if (bio.trim() !== (current.bio ?? '')) fields.bio = bio.trim();
    if ((x.handle ?? null) !== (current.x_url ?? null)) fields.x_url = x.handle ?? '';
    if (Object.keys(fields).length === 0) {
      sheetRef.current?.close();
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await updateTeam(slug, wallet, fields);
      await queryClient.invalidateQueries({ queryKey: keys.arenaAll });
      sheetRef.current?.close();
    } catch (e) {
      setEditError(friendlyTeamError(e));
    } finally {
      setSaving(false);
    }
  };

  const changePicture = async () => {
    if (!wallet) return;
    setAvatarMessage(null);
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    const problem = avatarError(asset.fileSize, asset.mimeType);
    if (problem) {
      setAvatarMessage(problem);
      return;
    }
    setUploading(true);
    try {
      await uploadTeamAvatar(slug, wallet, { mimeType: asset.mimeType ?? 'image/jpeg', name: asset.fileName ?? 'team.jpg', bytes: () => new File(asset.uri).bytes() });
      setAvatarFailed(false);
      setAvatarVersion(Date.now());
    } catch (e) {
      setAvatarMessage(friendlyTeamError(e));
    } finally {
      setUploading(false);
    }
  };

  if (team.isPending) {
    return (
      <Screen back>
        <CardSkeleton />
      </Screen>
    );
  }
  if (team.isError || !team.data) {
    return (
      <Screen title="Team" back>
        <ErrorState error={team.error} onRetry={() => team.refetch()} title="Could not load this team" />
      </Screen>
    );
  }

  const { team: t, arena, weeklyTotal, allTimeTotal } = team.data;
  const since = new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

  return (
    <Screen back>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}
      >
        <View style={styles.header}>
          <Pressable
            onPress={isCaptain ? changePicture : undefined}
            disabled={!isCaptain || uploading}
            accessibilityRole={isCaptain ? 'button' : 'image'}
            accessibilityLabel={isCaptain ? 'Change team picture' : t.name}
          >
            <View style={styles.avatar}>
              {avatarFailed ? (
                <Text style={{ fontSize: 32 }}>🛡️</Text>
              ) : (
                <Image
                  source={{ uri: teamAvatarUrl(slug, avatarVersion) }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  onError={() => setAvatarFailed(true)}
                />
              )}
            </View>
            {isCaptain ? <Text style={styles.avatarEdit}>{uploading ? 'Uploading' : 'Change'}</Text> : null}
          </Pressable>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.title} numberOfLines={2}>
              {t.name}
            </Text>
            <Text style={type.muted} numberOfLines={2}>
              {arena.emoji} {arena.name}
              {arena.status === 'ended' ? ' · ended' : ''} · {members.length} {members.length === 1 ? 'member' : 'members'} · since {since}
            </Text>
          </View>
        </View>
        {avatarMessage ? <Text style={[type.muted, { color: colors.no }]}>{avatarMessage}</Text> : null}

        {t.bio || t.x_url || isCaptain ? (
          <Card style={{ gap: spacing.sm }}>
            {t.bio ? <Text style={type.body}>{t.bio}</Text> : isCaptain ? <Text style={type.muted}>No bio yet.</Text> : null}
            {t.x_url ? (
              <Pressable onPress={() => Linking.openURL(`https://x.com/${t.x_url}`)} accessibilityRole="link" style={{ alignSelf: 'flex-start' }}>
                <Text style={styles.link}>@{t.x_url}</Text>
              </Pressable>
            ) : null}
            {isCaptain ? <Button label="Edit team details" tone="neutral" size="sm" onPress={startEditing} style={{ alignSelf: 'flex-start', paddingTop: spacing.xs }} /> : null}
          </Card>
        ) : null}

        {isCaptain && t.join_code ? (
          <Card style={styles.codeBox}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={type.label}>Join code</Text>
              <Text style={styles.code} selectable>
                {t.join_code}
              </Text>
              <Text style={type.muted}>Share it so friends can join your team.</Text>
            </View>
            <Button
              label="Share"
              tone="neutral"
              size="sm"
              onPress={() => Share.share({ message: `Join my team "${t.name}" in the Mentioned Arena. My code is ${t.join_code}.` })}
            />
          </Card>
        ) : null}

        <Card>
          <View style={styles.statRow}>
            <Stat label="Season points" value={weeklyTotal.toLocaleString()} />
            <Stat label="All-time points" value={allTimeTotal.toLocaleString()} align="right" />
          </View>
        </Card>

        <View style={styles.section}>
          <SectionTitle title="Members" right={<Segmented options={SORTS} value={sort} onChange={setSort} stretch={false} size="sm" />} />
          <Card padded={false} style={styles.listCard}>
            {members.map((m, i) => {
              const href = (m.username ? `/u/${encodeURIComponent(m.username)}` : `/positions?wallet=${m.wallet}`) as Href;
              return (
                <Link key={m.wallet} href={href} asChild>
                  <Pressable style={rowStyle(i === 0)} accessibilityRole="link" accessibilityLabel={m.username ?? shortAddress(m.wallet)}>
                    <Text style={styles.rank}>{i + 1}</Text>
                    <Text style={{ fontSize: 20 }}>{m.pfp_emoji ?? '🙂'}</Text>
                    <View style={styles.rowName}>
                      <Text style={styles.name} numberOfLines={1}>
                        {m.username ?? shortAddress(m.wallet)}
                      </Text>
                      <SeekerBadge wallet={m.wallet} />
                      {m.role === 'captain' ? <Pill label="CAPTAIN" tone="gold" /> : null}
                      {m.wallet === wallet ? <Pill label="YOU" tone="neutral" /> : null}
                    </View>
                    <Text style={type.money}>{(sort === 'season' ? m.weekly_points : m.all_time_points).toLocaleString()}</Text>
                  </Pressable>
                </Link>
              );
            })}
          </Card>
        </View>
      </ScrollView>

      <BottomSheet
        ref={sheetRef}
        visible={editing}
        onClose={() => setEditing(false)}
        title="Edit team"
        subtitle={t.name}
        locked={saving}
        footer={<Button label={saving ? 'Saving' : 'Save'} onPress={save} disabled={saving} />}
      >
        <Text style={type.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={(v) => {
            setName(v);
            setEditError(null);
          }}
          maxLength={30}
          style={styles.input}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Team name"
        />
        <Text style={type.label}>Bio</Text>
        <TextInput
          value={bio}
          onChangeText={(v) => {
            setBio(v.slice(0, BIO_MAX));
            setEditError(null);
          }}
          multiline
          maxLength={BIO_MAX}
          placeholder="Tell people about your team"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.bioInput]}
          accessibilityLabel="Team bio"
        />
        <Text style={type.muted}>
          {bio.length}/{BIO_MAX}
        </Text>
        <Text style={type.label}>X account</Text>
        <TextInput
          value={xHandle}
          onChangeText={(v) => {
            setXHandle(v);
            setEditError(null);
          }}
          placeholder="@username, or leave empty to remove"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel="X username"
        />
        {editError ? <Text style={[type.muted, { color: colors.no }]}>{editError}</Text> : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xs },
  avatar: { width: 72, height: 72, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  avatarEdit: { ...type.muted, textAlign: 'center', marginTop: 4, color: colors.gold },
  link: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.gold },
  codeBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  code: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, letterSpacing: 3, color: colors.gold },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  section: { gap: spacing.sm },
  listCard: { paddingHorizontal: spacing.md },
  rowName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text, flexShrink: 1 },
  rank: { width: 24, textAlign: 'center', fontFamily: fonts.bold, fontSize: 15, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  input: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.key,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
  bioInput: { minHeight: 96, paddingTop: spacing.sm, textAlignVertical: 'top' },
});
