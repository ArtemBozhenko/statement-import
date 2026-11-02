import { StyleSheet, View } from 'react-native';

import { ACTION_LABELS, describeOperation, type ImportAction } from '@/import/presentation';
import type { Operation } from '@/import/types';
import { useTheme } from '@/theme';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { formatBytes } from '@/ui/format';
import { KeyValueRow } from '@/ui/KeyValueRow';
import { Text } from '@/ui/Text';

import { RecurringList } from './RecurringList';

/** Panel of the current operation: file card, status, result (if ready) and actions. */
export interface StatusPanelProps {
  operation: Operation;
  /** Which action is running right now (blocks the other buttons). */
  pendingAction: ImportAction | null;
  onAction: (action: ImportAction) => void;
  /** Opens the details card of one recurring charge. */
  onDetails: (id: string) => void;
}

export function StatusPanel({ operation, pendingAction, onAction, onDetails }: StatusPanelProps) {
  const theme = useTheme();
  const view = describeOperation(operation);

  return (
    <View style={{ gap: theme.spacing.md }} testID="status-panel">
      <Card testID="file-card">
        <Text style={[theme.type.caption, { color: theme.colors.textMuted }]}>Statement</Text>
        <Text style={[theme.type.bodyStrong, { color: theme.colors.text }]} numberOfLines={2}>
          {operation.file.displayName}
        </Text>
        <KeyValueRow label="Format" value={operation.file.format.toUpperCase()} />
        <KeyValueRow label="Size" value={formatBytes(operation.file.sizeBytes)} />
      </Card>

      <Banner tone={view.tone} title={view.title} body={view.body} busy={view.busy} hint={view.offlineHint} testID="status-banner" />

      {operation.status === 'ready' && operation.result ? <RecurringList result={operation.result} onDetails={onDetails} /> : null}

      {view.actions.length > 0 ? (
        <View style={[styles.actions, { gap: theme.spacing.sm }]}>
          {view.actions.map((action) => (
            <Button
              key={action}
              label={ACTION_LABELS[action]}
              variant={action === 'delete' ? 'danger' : action === 'start_over' ? 'secondary' : 'primary'}
              onPress={() => onAction(action)}
              busy={pendingAction === action}
              disabled={pendingAction !== null && pendingAction !== action}
              testID={`action-${action}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ actions: { flexDirection: 'column' } });
