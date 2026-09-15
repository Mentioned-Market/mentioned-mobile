// Mentioned mobile theme (SPEC section 10, docs/DESIGN.md).
//
// Black ground, one dark surface for every card, gold for the brand and for
// anything selected, green and red only for a side or an outcome. Text is
// white or grey; nothing else carries colour.
import type { TextStyle } from 'react-native';

export const colors = {
  bg: '#000000',
  /** Every card. Neutral rather than warm so gold and green read cleanly on it. */
  surface: '#151515',
  /** A control sitting on a card: a key, a chip, a selected segment. */
  surfaceRaised: '#242424',
  /** Only for a hairline between rows inside one card. Cards have no outline. */
  border: '#2A2A2A',
  text: '#FFFFFF',
  textMuted: '#8F8F94',
  gold: '#F2B71F',
  goldDim: '#7A5C10',
  yes: '#3DDC84',
  no: '#FF5C5C',
  /** Tinted grounds for a green or red block, e.g. a claim card. */
  yesTint: 'rgba(61,220,132,0.14)',
  noTint: 'rgba(255,92,92,0.14)',
  goldTint: 'rgba(242,183,31,0.16)',
} as const;

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Card corners are large; controls are full pills; thumbnails sit between. */
export const radius = { card: 24, control: 999, thumb: 14, key: 16 } as const;

// Body text is never smaller than 14 (guide section 7).
export const type: Record<'display' | 'title' | 'heading' | 'body' | 'muted' | 'money' | 'label', TextStyle> = {
  /** One number a screen is about: a balance, an amount being typed. */
  display: { fontFamily: fonts.bold, fontSize: 56, lineHeight: 64, color: colors.text, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, color: colors.text, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  money: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  /** A small caption above a figure, e.g. "Positions". */
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.textMuted },
};
