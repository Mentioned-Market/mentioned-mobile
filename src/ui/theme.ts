// Mentioned mobile theme (V0_GUIDE section 7, step 1).
// Black ground, gold accent, Plus Jakarta Sans, tabular numerals for money.
export const colors = {
  bg: '#000000',
  surface: '#141311',
  surfaceRaised: '#1E1C18',
  border: '#2A2722',
  text: '#F5F2EA',
  textMuted: '#9A958A',
  gold: '#F2B71F',
  goldDim: '#7A5C10',
  yes: '#3DDC84',
  no: '#FF5C5C',
} as const;

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

// Body text is never smaller than 14 (guide section 7).
export const type = {
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, color: colors.text },
  heading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  money: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    fontVariant: ['tabular-nums' as const],
  },
} as const;
