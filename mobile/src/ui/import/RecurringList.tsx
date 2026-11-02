import { StyleSheet, View } from 'react-native';

import type { ImportResult } from '@/import/types';
import { useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { formatCadence, formatIsoDate, formatMoneyMinor, sumMinor } from '@/ui/format';
import { Text } from '@/ui/Text';

/**
 * List of recurring charges from the ready response and the monthly total.
 * Each row has a Details button; navigation is the caller's job so this component stays router-free.
 */
export function RecurringList({ result, onDetails }: { result: ImportResult; onDetails: (id: string) => void }) {
  const theme = useTheme();
  const total = sumMinor(result.items.map((item) => item.amountMinor));
  return (
    <Card testID="recurring-list">
      <Text style={[theme.type.heading, { color: theme.colors.text }]}>Recurring charges</Text>
      {result.items.map((item) => (
        <View key={item.id} style={[styles.item, { paddingVertical: theme.spacing.sm, gap: theme.spacing.sm, borderTopColor: theme.colors.border }]} testID={`recurring-item-${item.id}`}>
          <View style={[styles.row, { gap: theme.spacing.sm }]}>
            <View style={styles.rowText}>
              <Text style={[theme.type.bodyStrong, { color: theme.colors.text }]}>{item.merchant}</Text>
              <Text style={[theme.type.caption, { color: theme.colors.textMuted }]}>
                {formatCadence(item.cadence)} · last seen {formatIsoDate(item.lastSeen)}
              </Text>
            </View>
            <Text style={[theme.type.bodyStrong, { color: theme.colors.text }]}>{formatMoneyMinor(item.amountMinor, result.currency)}</Text>
          </View>
          <Button label="Details" variant="secondary" onPress={() => onDetails(item.id)} testID={`details-${item.id}`} />
        </View>
      ))}
      <View style={[styles.row, { paddingTop: theme.spacing.sm, borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: theme.spacing.sm }]}>
        <Text style={[theme.type.body, { color: theme.colors.textMuted }]}>Total per month</Text>
        <Text style={[theme.type.heading, { color: theme.colors.text }]} testID="recurring-total">
          {formatMoneyMinor(total, result.currency)}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  item: { borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  rowText: { flexShrink: 1, flexGrow: 1 },
});
