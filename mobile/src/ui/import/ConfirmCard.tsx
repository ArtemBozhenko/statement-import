import { StyleSheet, View } from 'react-native';

import type { FileMeta } from '@/import/types';
import { useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { formatBytes } from '@/ui/format';
import { KeyValueRow } from '@/ui/KeyValueRow';
import { Text } from '@/ui/Text';

/**
 * Confirmation step between the picker and the upload: name, size, format, and an explicit
 * Send or Cancel. Nothing has left the device while this card is on screen.
 */
export interface ConfirmCardProps {
  meta: FileMeta;
  /** Send is in flight: the buttons are locked. */
  busy?: boolean;
  onSend: () => void;
  onCancel: () => void;
}

export function ConfirmCard({ meta, busy = false, onSend, onCancel }: ConfirmCardProps) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }} testID="confirm-card">
      <Card>
        <Text style={[theme.type.caption, { color: theme.colors.textMuted }]}>Ready to send</Text>
        <Text style={[theme.type.bodyStrong, { color: theme.colors.text }]} numberOfLines={2} testID="confirm-name">
          {meta.displayName}
        </Text>
        <KeyValueRow label="Format" value={meta.format.toUpperCase()} />
        <KeyValueRow label="Size" value={formatBytes(meta.sizeBytes)} />
        <Text style={[theme.type.body, { color: theme.colors.textMuted }]}>Nothing has been sent yet.</Text>
      </Card>
      <View style={[styles.actions, { gap: theme.spacing.sm }]}>
        <Button label="Send statement" onPress={onSend} busy={busy} testID="confirm-send" />
        <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={busy} testID="confirm-cancel" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ actions: { flexDirection: 'column' } });
