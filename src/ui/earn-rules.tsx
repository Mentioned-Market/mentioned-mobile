// How points are earned, as the "How to earn points" sheet shows it on the
// Arena tab and on Ranks. The numbers are the server's (`usePointsRules`) and
// the wording is `@/lib/points-rules`; this only draws them.
import { Text, View } from 'react-native';

import { chatRule, earnSections } from '@/lib/points-rules';
import { Card } from '@/ui/card';
import { usePointsRules } from '@/ui/config-gate';
import { colors, fonts, spacing, type } from '@/ui/theme';

/** One scoring rule: the claim in bold, the detail after it. */
function Rule({ title, body }: { title: string; body: string }) {
  return (
    <Text style={type.body}>
      <Text style={{ fontFamily: fonts.semibold }}>{title}</Text> <Text style={{ color: colors.textMuted }}>{body}</Text>
    </Text>
  );
}

/** `intro` says what the points are for on the screen that opened the sheet. */
export function EarnRules({ intro }: { intro: string }) {
  const points = usePointsRules();
  const chat = chatRule(points);
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={type.muted}>{intro} Every point counts the same, but paid markets pay out far more than free play.</Text>
      {earnSections(points).map((section) => (
        <Card key={section.heading} style={{ gap: spacing.sm }}>
          <Text style={type.heading}>{section.heading}</Text>
          {section.rules.map((rule) => (
            <Rule key={rule.title} title={rule.title} body={rule.body} />
          ))}
        </Card>
      ))}
      <Text style={type.muted}>Points land when a market resolves, so hold your position to the close.{chat ? ` ${chat}` : ''}</Text>
    </View>
  );
}
