// Choose a username. Used at the end of sign-in and on the You tab.
//
// This is more than a display name: saving it is what creates the account's
// profile row on the server. Signing in alone does not, so an account without
// a username has nothing for Discord linking or admin verification to attach
// to, and cannot trade on free markets.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '@/api/client';
import { keys } from '@/api/queries';
import { setUsername, USERNAME_RE } from '@/api/user';
import { checkSlurs } from '@/lib/chatFilter';
import { sanitise } from '@/trade/free';
import { Button } from '@/ui/button';
import { colors, fonts, spacing, type } from '@/ui/theme';

/** Why a username would be refused, checked on the device with the website's rules. */
export function usernameError(raw: string): string | null {
  const name = raw.trim();
  if (!USERNAME_RE.test(name)) return '3 to 20 characters: letters, numbers and underscores only.';
  if (checkSlurs(name)) return 'That username is not allowed.';
  return null;
}

/** A sentence for a refused save. */
export function usernameSaveError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 409) return 'That username is taken. Try another.';
    if (e.status === 401) return 'Sign in again, then choose a username.';
    if (e.status === 429) return 'One moment. Try again shortly.';
    if (e.message) return sanitise(e.message);
  }
  return 'Could not save that. Check your connection and try again.';
}

type Props = {
  wallet: string;
  onSaved?: (username: string) => void;
  /** Hides the heading and explanation, for places that supply their own. */
  compact?: boolean;
};

export function UsernameForm({ wallet, onSaved, compact = false }: Props) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const problem = usernameError(value);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const name = value.trim();
      await setUsername(name);
      await queryClient.invalidateQueries({ queryKey: keys.profile(wallet) });
      onSaved?.(name);
    } catch (e) {
      setError(usernameSaveError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      {!compact ? (
        <>
          <Text style={type.heading}>Choose a username</Text>
          <Text style={type.muted}>This is how you appear on leaderboards and in results. It also finishes setting up your account.</Text>
        </>
      ) : null}
      <TextInput
        value={value}
        onChangeText={(v) => {
          setValue(v);
          setError(null);
        }}
        onSubmitEditing={save}
        placeholder="e.g. word_hunter"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="done"
        style={styles.input}
        accessibilityLabel="Username"
      />
      {error ? <Text style={[type.muted, { color: colors.no }]}>{error}</Text> : null}
      <Button label={busy ? 'Saving' : 'Save username'} onPress={save} disabled={busy || value.trim().length < 3} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, borderRadius: 24, backgroundColor: colors.surface, gap: spacing.sm },
  input: {
    height: 52,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
});
