// A medal, struck the way the website strikes it: an irregular disc of matte
// metal with a raised rim and the Mentioned mark on its face, gold, silver or
// bronze by purse. The shape's wobble is seeded from the medal's id, so each
// keeps its own outline and none of them shimmer between renders.
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { METAL, medalSeed, medalTier, sealPath } from '@/lib/medal';

export function Medallion({ id, amount, size = 44 }: { id: string; amount: string; size?: number }) {
  const tier = medalTier(amount);
  const metal = METAL[tier];
  const path = sealPath(medalSeed(id));
  const face = `face-${id}`;
  const rim = `rim-${id}`;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={rim} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={metal.light} />
            <Stop offset="0.5" stopColor={metal.mid} />
            <Stop offset="1" stopColor={metal.deep} />
          </LinearGradient>
          <RadialGradient id={face} cx="38%" cy="32%" r="78%">
            <Stop offset="0" stopColor={metal.light} />
            <Stop offset="0.55" stopColor={metal.mid} />
            <Stop offset="1" stopColor={metal.dark} />
          </RadialGradient>
        </Defs>
        {/* The rim is the same seal drawn a touch larger, so the face sits inside it. */}
        <Path d={path} fill={`url(#${rim})`} />
        <Path d={path} fill={`url(#${face})`} transform="translate(50 50) scale(0.86) translate(-50 -50)" />
      </Svg>
      {/* The mark, embossed: dark and faint, as struck metal rather than a logo. */}
      <Image
        source={require('@/assets/images/mark.png')}
        style={[StyleSheet.absoluteFill, { margin: size * 0.28 }]}
        contentFit="contain"
        tintColor={metal.deep}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}
