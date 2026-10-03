// "Continue with Google" and "Continue with X": the way we want people to sign
// in, so they lead the sign-in screen. White pills with each brand's own mark,
// the usual shape for a third-party login (Google's branding rules ask for the
// full-colour G on a light button), set apart from the app's gold and grey
// buttons on purpose: they hand you to someone else.
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { fonts, radius, spacing } from '@/ui/theme';

export type Provider = 'google' | 'x';

const LABEL: Record<Provider, string> = { google: 'Continue with Google', x: 'Continue with X' };

export function ProviderButton({ provider, onPress, disabled = false }: { provider: Provider; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={LABEL[provider]}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <View style={styles.mark}>{provider === 'google' ? <GoogleMark /> : <Ionicons name="logo-x" size={18} color={INK} />}</View>
      <Text style={styles.label} numberOfLines={1}>
        {LABEL[provider]}
      </Text>
    </Pressable>
  );
}

/** Google's full-colour G, from its sign-in branding kit. */
function GoogleMark() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

const INK = '#1F1F1F';

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: radius.control,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  mark: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, color: INK },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
});
