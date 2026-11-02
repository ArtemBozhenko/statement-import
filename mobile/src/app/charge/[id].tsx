import { useLocalSearchParams, useRouter } from 'expo-router';

import { useImportState } from '@/import/useImportState';
import { useTheme } from '@/theme';
import { Button, Card, KeyValueRow, Screen } from '@/ui';
import { formatCadence, formatIsoDate, formatMoneyMinor } from '@/ui/format';
import { Text } from '@/ui/Text';

/**
 * Details card of one recurring charge from the ready result. Display only: the assignment
 * has no subscription management, so the only action is Close.
 */
export default function ChargeDetailsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const operation = useImportState();
  const result = operation?.status === 'ready' ? operation.result : null;
  const item = result?.items.find((candidate) => candidate.id === id) ?? null;

  return (
    <Screen testID="charge-details-screen">
      {item && result ? (
        <Card testID="charge-card">
          <Text style={[theme.type.title, { color: theme.colors.text }]} accessibilityRole="header">
            {item.merchant}
          </Text>
          <Text style={[theme.type.heading, { color: theme.colors.text }]} testID="charge-amount">
            {formatMoneyMinor(item.amountMinor, result.currency)}
          </Text>
          <KeyValueRow label="Cadence" value={formatCadence(item.cadence)} />
          <KeyValueRow label="Last seen" value={formatIsoDate(item.lastSeen)} />
          <KeyValueRow label="Currency" value={result.currency} />
          <KeyValueRow label="Reference" value={item.id} mono />
        </Card>
      ) : (
        <Card>
          <Text style={[theme.type.body, { color: theme.colors.textMuted }]}>This charge is no longer available.</Text>
        </Card>
      )}
      <Button label="Close" variant="secondary" onPress={() => router.back()} testID="charge-close" />
    </Screen>
  );
}
