// The Mentioned lockup: the speech-bubble mark and the word beside it.
//
// Defined once because it was drifting. The two places that drew it by hand
// picked different mark sizes, and both fed the untrimmed 256x256 source to
// `contentFit: contain`. That source carries about 55px of transparent padding
// above and below the artwork, so `contain` fitted the padding rather than the
// mark and rendered it far smaller than the word next to it. That mismatch is
// what made the lockup look wrong.
//
// Two fixes are baked in here:
//  - assets/images/mark.png is the same art cropped to its ink, so a given
//    height is the height you actually see.
//  - the mark is tinted to the text colour. The source is pure white and the
//    body text is a warm off-white, and side by side the difference read as a
//    mistake rather than as a highlight.
import { Image } from 'expo-image';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts } from '@/ui/theme';

/** Width to height of assets/images/mark.png, after cropping to the artwork. */
const MARK_RATIO = 243 / 145;

export function Wordmark({ size = 22, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  // The mark reads as the same weight as the word when it matches cap height
  // rather than the full font size.
  const markHeight = Math.round(size * 0.82);

  return (
    <View style={[styles.row, style]}>
      <Image
        source={require('@/assets/images/mark.png')}
        style={{ height: markHeight, width: Math.round(markHeight * MARK_RATIO) }}
        contentFit="contain"
        tintColor={colors.text}
        accessibilityIgnoresInvertColors
      />
      <Text style={[styles.text, { fontSize: size, lineHeight: Math.round(size * 1.2) }]}>Mentioned</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontFamily: fonts.bold, color: colors.text, letterSpacing: -0.3 },
});
