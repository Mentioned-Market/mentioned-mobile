// Report a bug, from the Me tab. The form itself is `BugReport`; this screen
// is only the frame around it.
import { ScrollView, StyleSheet } from 'react-native';

import { useActiveWallet } from '@/store/active-wallet';
import { BugReport } from '@/ui/bug-report';
import { Screen } from '@/ui/screen';
import { spacing } from '@/ui/theme';

export default function BugReportScreen() {
  const wallet = useActiveWallet();
  return (
    <Screen title="Report a bug" back>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <BugReport wallet={wallet} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing.md, paddingBottom: spacing.xl } });
