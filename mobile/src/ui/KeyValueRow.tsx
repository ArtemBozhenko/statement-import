import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from '@/ui/Text';

/** A "label — value" row; with large fonts the value wraps onto the next line. */
export function KeyValueRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { gap: theme.spacing.sm }]} accessibilityLabel={`${label}: ${value}`}>
      <Text style={[theme.type.caption, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[mono ? theme.type.mono : theme.type.body, styles.value, { color: theme.colors.text }]} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline' },
  value: { flexShrink: 1, textAlign: 'right' },
});
