import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

/** Screen scaffold: scrolling is always enabled (large fonts and iPhone SE); the bottom inset accounts for the home indicator. */
export function Screen({ children, testID }: PropsWithChildren<{ testID?: string }>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      testID={testID}
      style={[styles.scroll, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.lg + insets.bottom, gap: theme.spacing.md }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ scroll: { flex: 1 } });
